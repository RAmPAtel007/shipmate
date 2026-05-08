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

    // Get channel members
    const channelSnap = await db.collection('channels').doc(msg.channelId).get();
    if (!channelSnap.exists) return;

    const channel = channelSnap.data()!;
    const members: string[] = channel.members ?? [];

    // Get FCM tokens for all members except sender
    const recipientIds = members.filter((id: string) => id !== msg.senderId);
    if (!recipientIds.length) return;

    const userSnaps = await Promise.all(
      recipientIds.map(id => db.collection('users').doc(id).get())
    );

    const tokens: string[] = [];
    for (const userSnap of userSnaps) {
      if (!userSnap.exists) continue;
      const userData = userSnap.data()!;
      const userTokens: string[] = userData.notificationTokens ?? [];
      tokens.push(...userTokens);
    }

    if (!tokens.length) return;

    const channelLabel = channel.type === 'dm'
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
            badge: '/icons/badge-72.png',
            tag: msg.channelId,
            renotify: true,
          },
          fcmOptions: {
            link: `/chat?channel=${msg.channelId}`,
          },
        },
      });
    }
  });
