import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ─────────────────────────────────────────────────────────────────────────────
// onUserCreate — set custom claims + audit log
// ─────────────────────────────────────────────────────────────────────────────

export const onUserCreate = functions
  .region('asia-south1')
  .auth.user()
  .onCreate(async (user) => {
    if (!user.email?.endsWith('@shipcube.com')) {
      functions.logger.warn('Non-shipcube signup blocked', { email: user.email });
      await admin.auth().deleteUser(user.uid);
      return;
    }

    // Check if Firestore profile exists (created on first login)
    const profileRef = db.collection('users').doc(user.uid);
    const profileSnap = await profileRef.get();

    const role = profileSnap.exists ? (profileSnap.data()?.role ?? 'employee') : 'employee';
    const department = profileSnap.exists ? (profileSnap.data()?.department ?? 'ai-team') : 'ai-team';

    // Set custom claims for Firestore rules
    await admin.auth().setCustomUserClaims(user.uid, { role, department });

    // Audit log
    await db.collection('auditLogs').add({
      action: 'user_created',
      targetId: user.uid,
      targetEmail: user.email,
      performedBy: 'system',
      metadata: { role, department },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info('User created and claims set', { uid: user.uid, role, department });
  });

// ─────────────────────────────────────────────────────────────────────────────
// onUserRoleUpdate — refresh custom claims when role/dept changes in Firestore
// ─────────────────────────────────────────────────────────────────────────────

export const onUserRoleUpdate = functions
  .region('asia-south1')
  .firestore.document('users/{uid}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const roleChanged = before.role !== after.role;
    const deptChanged = before.department !== after.department;

    if (!roleChanged && !deptChanged) return;

    const uid = context.params.uid;
    await admin.auth().setCustomUserClaims(uid, {
      role: after.role,
      department: after.department,
    });

    // Audit log
    await db.collection('auditLogs').add({
      action: 'user_updated',
      targetId: uid,
      performedBy: 'system',
      metadata: {
        ...(roleChanged ? { roleFrom: before.role, roleTo: after.role } : {}),
        ...(deptChanged ? { deptFrom: before.department, deptTo: after.department } : {}),
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info('Custom claims updated', { uid, role: after.role, department: after.department });
  });

// ─────────────────────────────────────────────────────────────────────────────
// onLeaveUpdate — auto-post a message to #leaves channel on status change
// ─────────────────────────────────────────────────────────────────────────────

export const onLeaveUpdate = functions
  .region('asia-south1')
  .firestore.document('leaveRequests/{leaveId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status === after.status) return;

    // Find the #leaves channel
    const channelsSnap = await db
      .collection('channels')
      .where('name', '==', 'leaves')
      .where('type', '==', 'public')
      .limit(1)
      .get();

    if (channelsSnap.empty) return;
    const leavesChannelId = channelsSnap.docs[0].id;

    const leaveTypeMap: Record<string, string> = {
      'casual': 'Casual Leave',
      'sick': 'Sick Leave',
      'wfh': 'Work From Home',
      'unpaid': 'Unpaid Leave',
      'comp-off': 'Comp-Off',
    };
    const typeLabel = leaveTypeMap[after.type] ?? after.type;

    let text = '';
    if (after.status === 'approved') {
      text = `✅ ${after.employeeName}'s ${typeLabel} (${after.startDate} → ${after.endDate}) has been **approved**.`;
    } else if (after.status === 'rejected') {
      text = `❌ ${after.employeeName}'s ${typeLabel} request has been **rejected**.`;
    } else if (after.status === 'cancelled') {
      text = `🚫 ${after.employeeName} cancelled their ${typeLabel} request.`;
    }

    if (!text) return;

    const msgRef = db.collection('messages').doc();
    await msgRef.set({
      id: msgRef.id,
      channelId: leavesChannelId,
      senderId: 'system',
      senderName: 'Shipmate Bot',
      text,
      messageType: 'system',
      isDeleted: false,
      isEdited: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update channel's lastMessageAt
    await db.collection('channels').doc(leavesChannelId).update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessagePreview: text.replace(/\*\*/g, ''),
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// dailyBirthdayCheck — runs at 8AM IST via Cloud Scheduler
// ─────────────────────────────────────────────────────────────────────────────

export const dailyBirthdayCheck = functions
  .region('asia-south1')
  .pubsub.schedule('0 2 * * *') // 2AM UTC = 7:30AM IST (approx)
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayMMDD = `${mm}-${dd}`;

    // Get all users with a birthday
    const usersSnap = await db
      .collection('users')
      .where('status', '==', 'active')
      .get();

    const birthdayPeople = usersSnap.docs.filter(d => {
      const bday: string = d.data().birthday ?? '';
      return bday.slice(5) === todayMMDD; // birthday is YYYY-MM-DD
    });

    if (birthdayPeople.length === 0) {
      functions.logger.info('No birthdays today', { date: todayMMDD });
      return;
    }

    // Find #general channel
    const generalSnap = await db
      .collection('channels')
      .where('name', '==', 'general')
      .where('type', '==', 'public')
      .limit(1)
      .get();

    if (generalSnap.empty) return;
    const generalChannelId = generalSnap.docs[0].id;

    for (const person of birthdayPeople) {
      const data = person.data();
      const text = `🎂 It's ${data.name}'s birthday today! Wish them a happy birthday! 🎉`;

      const msgRef = db.collection('messages').doc();
      await msgRef.set({
        id: msgRef.id,
        channelId: generalChannelId,
        senderId: 'system',
        senderName: 'Shipmate Bot',
        text,
        messageType: 'system',
        isDeleted: false,
        isEdited: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Store birthday wish record
      await db.collection('birthdayWishes').add({
        userId: person.id,
        year: today.getFullYear(),
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info('Birthday message sent', { userId: person.id, name: data.name });
    }

    await db.collection('channels').doc(generalChannelId).update({
      lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

// ─────────────────────────────────────────────────────────────────────────────
// leaveBalanceReset — runs Jan 1 each year to reset annual leave balances
// ─────────────────────────────────────────────────────────────────────────────

export const leaveBalanceReset = functions
  .region('asia-south1')
  .pubsub.schedule('0 0 1 1 *') // Midnight Jan 1 UTC
  .timeZone('Asia/Kolkata')
  .onRun(async () => {
    const newYear = new Date().getFullYear();
    const usersSnap = await db.collection('users').where('status', '==', 'active').get();

    const batch = db.batch();
    for (const userDoc of usersSnap.docs) {
      const balanceRef = db
        .collection('leaveBalances')
        .doc(`${userDoc.id}_${newYear}`);

      batch.set(balanceRef, {
        uid: userDoc.id,
        year: newYear,
        casual: 12,
        sick: 6,
        wfh: 24,
        unpaid: 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    functions.logger.info('Leave balances reset', { year: newYear, count: usersSnap.size });
  });

// ─────────────────────────────────────────────────────────────────────────────
// sendNotification — called via Firestore trigger on new messages
// ─────────────────────────────────────────────────────────────────────────────

export const onNewMessage = functions
  .region('asia-south1')
  .firestore.document('messages/{messageId}')
  .onCreate(async (snap) => {
    const msg = snap.data();
    if (msg.messageType === 'system') return; // Don't notify for bot messages
    if (!msg.channelId || !msg.senderId) return;

    // Get channel info
    const channelSnap = await db.collection('channels').doc(msg.channelId).get();
    if (!channelSnap.exists) return;

    const channel = channelSnap.data()!;
    const channelType: string = channel.type ?? 'public'; // 'public' | 'private' | 'dm' | 'department'

    let recipientIds: string[] = [];

    if (channelType === 'public') {
      // Public channels → notify ALL active employees except the sender
      const allUsersSnap = await db.collection('users').where('status', '==', 'active').get();
      recipientIds = allUsersSnap.docs
        .map(d => d.id)
        .filter(id => id !== msg.senderId);
    } else {
      // DM / private / department channels → only explicit members except sender
      const members: string[] = channel.members ?? [];
      recipientIds = members.filter((id: string) => id !== msg.senderId);
    }

    if (!recipientIds.length) return;

    // Collect FCM tokens for all recipients
    const userSnaps = await Promise.all(
      recipientIds.map(id => db.collection('users').doc(id).get())
    );

    const tokens: string[] = [];
    for (const userSnap of userSnaps) {
      if (!userSnap.exists) continue;
      const userData = userSnap.data()!;
      if (userData.fcmToken) tokens.push(userData.fcmToken);
      const legacyTokens: string[] = userData.notificationTokens ?? [];
      tokens.push(...legacyTokens);
    }

    if (!tokens.length) return;

    // DM → show sender name. Channel → show #channel-name
    const channelLabel = channelType === 'dm'
      ? msg.senderName
      : `#${channel.name}`;

    const preview = msg.textPreview ?? msg.text?.slice(0, 100) ?? 'Sent an attachment';

    const notification = {
      title: `${msg.senderName} in ${channelLabel}`,
      body: preview,
    };

    // Send in batches of 500 (FCM limit)
    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification,
        webpush: {
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: msg.channelId,
            renotify: true,
          },
          fcmOptions: {
            link: `/chat?channel=${msg.channelId}`,
          },
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#1B2B5E',
            channelId: 'shipmate_chat',
          },
        },
      });
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// onNewAnnouncement — push notification to ALL employees when published
// ─────────────────────────────────────────────────────────────────────────────

export const onNewAnnouncement = functions
  .region('asia-south1')
  .firestore.document('announcements/{announcementId}')
  .onCreate(async (snap) => {
    const ann = snap.data();
    if (!ann) return;

    // Get all active employees' FCM tokens
    const usersSnap = await db.collection('users').where('status', '==', 'active').get();

    const tokens: string[] = [];
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data();
      if (data.fcmToken) tokens.push(data.fcmToken);
      const legacy: string[] = data.notificationTokens ?? [];
      tokens.push(...legacy);
    }

    if (!tokens.length) return;

    const body = ann.body ?? ann.content ?? '';
    const preview = body.length > 100 ? body.slice(0, 100) + '…' : body;

    const batchSize = 500;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: `📢 ${ann.title ?? 'New Announcement'}`,
          body: preview,
        },
        webpush: {
          notification: {
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            tag: 'announcement',
            renotify: true,
          },
          fcmOptions: { link: '/announcements' },
        },
        android: {
          notification: {
            icon: 'ic_notification',
            color: '#F5C518',
            channelId: 'shipmate_announcements',
          },
        },
      });
    }

    functions.logger.info('Announcement push sent', { id: snap.id, recipients: tokens.length });
  });

// ─────────────────────────────────────────────────────────────────────────────
// onLeaveDecision — push to employee when their leave is approved/rejected
// ─────────────────────────────────────────────────────────────────────────────

export const onLeaveDecision = functions
  .region('asia-south1')
  .firestore.document('leaveRequests/{leaveId}')
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after  = change.after.data();

    if (before.status === after.status) return;
    if (!['approved', 'rejected'].includes(after.status)) return;

    // Get employee's FCM token
    const employeeSnap = await db.collection('users').doc(after.employeeId).get();
    if (!employeeSnap.exists) return;

    const employee = employeeSnap.data()!;
    const tokens: string[] = [];
    if (employee.fcmToken) tokens.push(employee.fcmToken);
    const legacy: string[] = employee.notificationTokens ?? [];
    tokens.push(...legacy);

    if (!tokens.length) return;

    const isApproved = after.status === 'approved';
    const leaveTypeMap: Record<string, string> = {
      casual: 'Casual Leave', sick: 'Sick Leave', wfh: 'WFH',
      unpaid: 'Unpaid Leave', 'comp-off': 'Comp-Off',
      'half-day-first': 'Half Day', 'half-day-second': 'Half Day',
    };
    const typeLabel = leaveTypeMap[after.type] ?? after.type;

    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: isApproved ? '✅ Leave Approved' : '❌ Leave Rejected',
        body: `Your ${typeLabel} (${after.startDate} → ${after.endDate}) has been ${after.status}.`,
      },
      webpush: {
        notification: {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          tag: 'leave-decision',
        },
        fcmOptions: { link: '/leaves' },
      },
      android: {
        notification: {
          icon: 'ic_notification',
          color: isApproved ? '#10B981' : '#EF4444',
          channelId: 'shipmate_leaves',
        },
      },
    });

    functions.logger.info('Leave decision push sent', {
      leaveId: change.after.id,
      status: after.status,
      employeeId: after.employeeId,
    });
  });
