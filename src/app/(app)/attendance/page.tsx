'use client';

import { useState, useEffect, useRef } from 'react';
import {
  LogIn, LogOut, Clock, CheckCircle2, Calendar,
  Loader2, TrendingUp, Timer, Zap, MapPin, AlertTriangle,
  Camera, RotateCcw, Check, X, CameraOff,
} from 'lucide-react';
import {
  collection, query, where, onSnapshot,
  doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { storageService } from '@/lib/services/storageService';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'on_time' | 'late' | 'remote' | 'on_leave' | 'missing';
type LocState = 'idle' | 'requesting' | 'denied' | 'unavailable';

interface GeoPoint { lat: number; lng: number; accuracy: number }

interface AttendanceRecord {
  uid: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  hours: number;
  status: AttendanceStatus;
  otHours?: number;
  punchInLocation?: GeoPoint;
  punchOutLocation?: GeoPoint;
  punchInPhoto?: string;
  punchOutPhoto?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AttendanceStatus, { label: string; bg: string; text: string }> = {
  on_time:  { label: 'On Time',  bg: 'bg-green-100',  text: 'text-green-700'  },
  late:     { label: 'Late',     bg: 'bg-amber-100',  text: 'text-amber-700'  },
  remote:   { label: 'Remote',   bg: 'bg-blue-100',   text: 'text-blue-700'   },
  on_leave: { label: 'On Leave', bg: 'bg-violet-100', text: 'text-violet-700' },
  missing:  { label: 'Absent',   bg: 'bg-red-100',    text: 'text-red-700'    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }

function nowHHMMSS() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

/** HH:MM only — used for punch timestamps stored in Firestore */
function nowHHMM() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function calcHours(pIn: string | null, pOut: string | null): number {
  if (!pIn || !pOut) return 0;
  const [ih, im] = pIn.split(':').map(Number);
  const [oh, om] = pOut.split(':').map(Number);
  return Math.round(((oh * 60 + om) - (ih * 60 + im)) / 60 * 100) / 100;
}

function autoStatus(punchIn: string): AttendanceStatus {
  const [h, m] = punchIn.split(':').map(Number);
  // Late only if punch-in is at or after 11:00 AM
  return (h * 60 + m) >= 11 * 60 ? 'late' : 'on_time';
}

/**
 * Always derive the display status from the punch-in time using the current
 * rule (late = 11:00 AM+). This overrides any stale 'late' value that was
 * stored in Firestore under an old threshold.
 */
function displayStatus(rec: AttendanceRecord): AttendanceStatus {
  if (rec.punchIn && (rec.status === 'on_time' || rec.status === 'late')) {
    return autoStatus(rec.punchIn);
  }
  return rec.status;
}

function fmtCoords(pt?: GeoPoint) {
  if (!pt) return null;
  const lat = pt.lat.toFixed(4);
  const lng = pt.lng.toFixed(4);
  return `${Math.abs(Number(lat))}°${Number(lat) >= 0 ? 'N' : 'S'} ${Math.abs(Number(lng))}°${Number(lng) >= 0 ? 'E' : 'W'}`;
}

/** Request GPS — resolves with coords or rejects with 'denied' | 'unavailable' */
function requestLocation(): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject('unavailable'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: Math.round(pos.coords.accuracy),
      }),
      err => reject(err.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** Numbered step row used inside permission-denied instructions */
function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-5 h-5 rounded-full bg-white/20 text-white text-[11px] font-black flex-shrink-0 flex items-center justify-center">
        {n}
      </span>
      <p className="text-white/80 text-sm leading-snug">{text}</p>
    </div>
  );
}

// ─── Camera Capture ───────────────────────────────────────────────────────────
// Mobile  → <input capture="user"> opens native camera app, zero permission hassle
// Desktop → getUserMedia in-browser viewfinder

function CameraCapture({
  punchType, onCapture, onCancel,
}: { punchType: 'in'|'out'; onCapture: (b: Blob) => void; onCancel: () => void }) {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return isMobile
    ? <MobileCameraCapture  punchType={punchType} onCapture={onCapture} onCancel={onCancel} />
    : <DesktopCameraCapture punchType={punchType} onCapture={onCapture} onCancel={onCancel} />;
}

// ── Mobile ────────────────────────────────────────────────────────────────────

function MobileCameraCapture({
  punchType, onCapture, onCancel,
}: { punchType:'in'|'out'; onCapture:(b:Blob)=>void; onCancel:()=>void }) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file,    setFile]    = useState<File | null>(null);

  const label    = punchType === 'in' ? 'Punch In' : 'Punch Out';
  const accentBg = punchType === 'in' ? 'bg-[#1B2B5E]' : 'bg-red-500';

  // Open camera automatically on mount
  useEffect(() => {
    const t = setTimeout(() => fileRef.current?.click(), 120);
    return () => clearTimeout(t);
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function retake() {
    setPreview(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setTimeout(() => fileRef.current?.click(), 80);
  }

  function confirmPhoto() { if (file) onCapture(file); }

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      {/* Hidden native camera input */}
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />

      {/* Top bar — extra top padding for iPhone notch/status bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 flex-shrink-0"
        style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white">
          <X size={18} />
        </button>
        <p className="text-white font-bold text-sm tracking-wide">{label} · Take a Selfie</p>
        <div className="w-9" />
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
        {preview ? (
          <>
            <div className="w-60 h-60 rounded-3xl overflow-hidden border-4 border-white/20 shadow-2xl">
              <img src={preview} alt="selfie" className="w-full h-full object-cover" />
            </div>
            <p className="text-white/50 text-sm">Looking good? Use this or retake.</p>
          </>
        ) : (
          <>
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center">
              <Camera size={40} className="text-white/60" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-white font-bold text-lg">Camera opening…</p>
              <p className="text-white/40 text-sm">Take your selfie, then come back here.</p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-6 py-3 rounded-2xl bg-white/10 text-white text-sm font-semibold"
            >
              Open Camera
            </button>
          </>
        )}
      </div>

      {/* Controls — extra bottom padding for iPhone home indicator */}
      <div className="flex-shrink-0 bg-black/70 px-6 pt-6 pb-8 flex items-center justify-center gap-4"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        {preview ? (
          <>
            <button onClick={retake} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm">
              <RotateCcw size={16} /> Retake
            </button>
            <button onClick={confirmPhoto} className={`flex items-center gap-2 px-8 py-3 rounded-2xl ${accentBg} text-white font-black text-sm shadow-lg active:scale-95 transition-all`}>
              <Check size={18} /> Use Photo
            </button>
          </>
        ) : (
          <button onClick={onCancel} className="px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm">Cancel</button>
        )}
      </div>
    </div>
  );
}

// ── Desktop / Laptop ─────────────────────────────────────────────────────────

function DesktopCameraCapture({
  punchType, onCapture, onCancel,
}: { punchType:'in'|'out'; onCapture:(b:Blob)=>void; onCancel:()=>void }) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const fileRef     = useRef<HTMLInputElement>(null);

  const [camState,   setCamState]   = useState<'starting'|'live'|'captured'|'error'>('starting');
  const [preview,    setPreview]    = useState<string | null>(null);
  const [permDenied, setPermDenied] = useState(false);

  const label    = punchType === 'in' ? 'Punch In' : 'Punch Out';
  const accentBg = punchType === 'in' ? 'bg-[#1B2B5E]' : 'bg-red-500';

  // Detect browser for tailored instructions
  const isChrome  = /Chrome/.test(navigator.userAgent)  && !/Edg/.test(navigator.userAgent);
  const isEdge    = /Edg/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);
  const isSafari  = /Safari/.test(navigator.userAgent)  && !/Chrome/.test(navigator.userAgent);

  useEffect(() => { startCamera(); return () => stopStream(); /* eslint-disable-next-line */ }, []);

  async function startCamera() {
    setCamState('starting'); setPreview(null); setPermDenied(false);

    // If camera permission is already denied, skip straight to file upload
    try {
      const perm = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (perm.state === 'denied') {
        setPermDenied(true);
        setCamState('error');
        setTimeout(() => fileRef.current?.click(), 100);
        return;
      }
    } catch { /* Permissions API not supported — proceed normally */ }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCamState('live');
    } catch (err: unknown) {
      const name = (err as { name?: string }).name ?? '';
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      setPermDenied(denied);
      setCamState('error');
      // Auto-open file picker so the user isn't stuck on the error screen
      if (denied) setTimeout(() => fileRef.current?.click(), 150);
    }
  }

  function stopStream() { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }

  function takePhoto() {
    const v = videoRef.current; const c = canvasRef.current; if (!v || !c) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(v, 0, 0); ctx.restore();
    setPreview(c.toDataURL('image/jpeg', 0.85)); setCamState('captured'); stopStream();
  }

  // Fallback: user uploads a photo file when camera is blocked
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPreview(URL.createObjectURL(f));
    setCamState('captured');
    stopStream();
    // Store file for confirmPhoto
    streamRef.current = null;
    canvasRef.current && (canvasRef.current.dataset.file = 'true');
    // Save file ref for confirm
    (fileRef as any)._file = f;
  }

  function retake() { setPreview(null); startCamera(); }

  function confirmPhoto() {
    // If came from file upload
    const uploadedFile = (fileRef as any)._file as File | undefined;
    if (uploadedFile) {
      onCapture(uploadedFile);
      (fileRef as any)._file = undefined;
      return;
    }
    canvasRef.current?.toBlob(b => { if (b) onCapture(b); }, 'image/jpeg', 0.85);
  }

  // Browser-specific instructions
  function PermInstructions() {
    if (isChrome || isEdge) return (
      <div className="bg-white/10 rounded-2xl p-4 text-left space-y-3 mb-5">
        <Step n={1} text={`Click the 🔒 lock icon in the address bar (left of the URL)`} />
        <Step n={2} text="Find Camera and change it to Allow" />
        <Step n={3} text="Reload the page, then tap Try Again" />
      </div>
    );
    if (isFirefox) return (
      <div className="bg-white/10 rounded-2xl p-4 text-left space-y-3 mb-5">
        <Step n={1} text="Click the camera icon in the address bar" />
        <Step n={2} text="Select 'Allow Camera access'" />
        <Step n={3} text="Click Try Again below" />
      </div>
    );
    if (isSafari) return (
      <div className="bg-white/10 rounded-2xl p-4 text-left space-y-3 mb-5">
        <Step n={1} text="Open Safari menu → Settings for This Website" />
        <Step n={2} text="Set Camera to Allow" />
        <Step n={3} text="Reload and click Try Again" />
      </div>
    );
    return (
      <div className="bg-white/10 rounded-2xl p-4 text-left space-y-3 mb-5">
        <Step n={1} text="Click the camera or lock icon in your browser's address bar" />
        <Step n={2} text="Allow camera access for this site" />
        <Step n={3} text="Click Try Again below" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-[60] flex flex-col">
      {/* Hidden file input fallback */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      <div className="flex items-center justify-between px-4 py-3 bg-black/70 flex-shrink-0">
        <button onClick={() => { stopStream(); onCancel(); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
          <X size={18} />
        </button>
        <p className="text-white font-bold text-sm tracking-wide">{label} · Take a Selfie</p>
        <div className="w-9" />
      </div>

      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {camState === 'error' ? (
          <div className="text-center px-6 py-6 max-w-sm mx-auto overflow-y-auto">
            <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CameraOff size={28} className="text-red-400" />
            </div>
            <p className="text-white font-black text-lg mb-2">Camera access needed</p>

            {permDenied ? (
              <>
                <p className="text-white/60 text-sm leading-relaxed mb-4">
                  Camera is blocked in your browser. A file picker has opened — select or take a photo to continue.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-black mb-4"
                >
                  Choose / Take a Photo
                </button>
                <p className="text-white/30 text-[11px] mb-3">Want to fix camera access instead?</p>
                <PermInstructions />
                <button onClick={startCamera} className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors">
                  Try Camera Again
                </button>
              </>
            ) : (
              <>
                <p className="text-white/60 text-sm leading-relaxed mb-5">
                  Camera unavailable — it may be in use by another app, or not connected.
                </p>
                <button onClick={startCamera} className="w-full py-3 rounded-xl bg-white text-gray-900 text-sm font-black mb-3">
                  Try Again
                </button>
                <p className="text-white/30 text-xs mb-2">— or —</p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-3 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
                >
                  Upload a photo instead
                </button>
              </>
            )}
          </div>
        ) : preview ? (
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
        ) : (
          <>
            {camState === 'starting' && <div className="absolute inset-0 flex items-center justify-center z-10"><Loader2 size={36} className="text-white/40 animate-spin" /></div>}
            <video ref={videoRef} className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} playsInline muted />
          </>
        )}
        {camState === 'live' && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-52 h-64 rounded-full border-2 border-white/30 border-dashed" /></div>}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex-shrink-0 bg-black/70 px-6 pt-6 pb-8 flex items-center justify-center gap-8"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
        {camState === 'live' ? (
          <button onClick={takePhoto} className="w-20 h-20 rounded-full bg-white active:scale-95 transition-transform shadow-xl flex items-center justify-center">
            <div className="w-[68px] h-[68px] rounded-full bg-white border-4 border-gray-300" />
          </button>
        ) : camState === 'captured' ? (
          <>
            <button onClick={retake} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm hover:bg-white/20"><RotateCcw size={16} /> Retake</button>
            <button onClick={confirmPhoto} className={`flex items-center gap-2 px-8 py-3 rounded-2xl ${accentBg} text-white font-black text-sm shadow-lg active:scale-95`}><Check size={18} /> Use Photo</button>
          </>
        ) : camState === 'error' ? (
          <button onClick={() => { stopStream(); onCancel(); }} className="px-6 py-3 rounded-2xl bg-white/10 text-white font-semibold text-sm">Cancel</button>
        ) : null}
      </div>
      {camState === 'live' && <p className="text-center text-white/30 text-[11px] pb-3 flex-shrink-0">Position your face in the circle and tap the shutter</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { currentUser } = useAuth();
  const [records, setRecords]   = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [liveTime, setLiveTime] = useState(nowHHMMSS());
  const [, setTick] = useState(0); // forces re-render every second
  const [locState, setLocState] = useState<LocState>('idle');
  const [onApprovedLeave, setOnApprovedLeave] = useState(false);
  const [leaveName, setLeaveName] = useState('');
  const [showPunchOutConfirm, setShowPunchOutConfirm] = useState(false);
  // 'in' | 'out' | null — which punch type the camera is open for
  const [cameraFor, setCameraFor] = useState<'in' | 'out' | null>(null);

  const today       = todayISO();
  const todayRec    = records[today] ?? null;
  const isPunchedIn  = !!todayRec?.punchIn;
  const isPunchedOut = !!todayRec?.punchOut;

  // Tick every second — updates clock and live work duration
  useEffect(() => {
    const t = setInterval(() => {
      setLiveTime(nowHHMMSS());
      setTick(n => n + 1);
    }, 1_000);
    return () => clearInterval(t);
  }, []);

  // Real-time attendance listener
  useEffect(() => {
    if (!currentUser) return;
    const cutoff = (() => {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    })();
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), where('uid', '==', currentUser.uid)),
      snap => {
        const m: Record<string, AttendanceRecord> = {};
        snap.docs.forEach(d => {
          const r = d.data() as AttendanceRecord;
          if (r.date >= cutoff) m[r.date] = r;
        });
        setRecords(m);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [currentUser]);

  // Approved leave check
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'leaveRequests'),
        where('employeeId', '==', currentUser.uid),
        where('status', '==', 'approved'),
      ),
      snap => {
        const todayStr = todayISO();
        const activeLeave = snap.docs.map(d => d.data())
          .find(l => l.startDate <= todayStr && l.endDate >= todayStr);
        if (activeLeave) {
          setOnApprovedLeave(true);
          const typeLabels: Record<string, string> = {
            casual: 'Paid Leave', sick: 'Sick Leave', unpaid: 'Unpaid Leave',
            wfh: 'Work From Home', 'half-day-first': 'Half Day', 'half-day-second': 'Half Day',
          };
          setLeaveName(typeLabels[activeLeave.type] ?? 'Leave');
        } else {
          setOnApprovedLeave(false);
          setLeaveName('');
        }
      },
      () => setOnApprovedLeave(false),
    );
    return () => unsub();
  }, [currentUser]);

  // ── Punch handlers (called after photo is captured) ─────────────────────────

  async function handlePunchIn(photoBlob: Blob) {
    if (!currentUser) return;
    setSaving(true);
    setLocState('requesting');

    // Run location + photo upload in parallel for speed
    let location: GeoPoint | null = null;
    let photoUrl: string | null   = null;

    try {
      [location, photoUrl] = await Promise.all([
        requestLocation(),
        storageService.uploadAttendancePhoto(currentUser.uid, today, 'in', photoBlob)
          .catch((e) => { console.error('Photo upload failed:', e); toast.error('Photo upload failed — punch-in saved without photo.'); return null; }),
      ]);
      setLocState('idle');
    } catch (err) {
      const reason = err as 'denied' | 'unavailable';
      setLocState(reason);
      setSaving(false);
      toast.error(
        reason === 'denied'
          ? 'Location access denied. Please allow location in your browser settings and try again.'
          : 'Unable to get your location. Check GPS/network and try again.',
      );
      return;
    }

    const now    = nowHHMM();
    const status = autoStatus(now);
    try {
      await setDoc(doc(db, 'attendance', `${currentUser.uid}_${today}`), {
        uid: currentUser.uid,
        date: today,
        punchIn: now,
        punchOut: null,
        hours: 0,
        status,
        punchInLocation: location,
        ...(photoUrl ? { punchInPhoto: photoUrl } : {}),
        createdAt: serverTimestamp(),
      }, { merge: true });
      toast.success(
        status === 'late'
          ? `Punched in at ${now} · Running late 😬`
          : `Punched in at ${now} · On time! 🎉`,
      );
    } catch { toast.error('Failed to punch in'); }
    finally { setSaving(false); }
  }

  async function handlePunchOut(photoBlob: Blob) {
    if (!currentUser || !todayRec?.punchIn) return;

    setSaving(true);
    setLocState('requesting');

    let location: GeoPoint | null = null;
    let photoUrl: string | null   = null;

    try {
      [location, photoUrl] = await Promise.all([
        requestLocation(),
        storageService.uploadAttendancePhoto(currentUser.uid, today, 'out', photoBlob)
          .catch((e) => { console.error('Photo upload failed:', e); toast.error('Photo upload failed — punch-out saved without photo.'); return null; }),
      ]);
      setLocState('idle');
    } catch (err) {
      const reason = err as 'denied' | 'unavailable';
      setLocState(reason);
      setSaving(false);
      toast.error(
        reason === 'denied'
          ? 'Location access denied. Please allow location and try again.'
          : 'Unable to get location. Try again.',
      );
      return;
    }

    const now   = nowHHMM();
    const hours = calcHours(todayRec.punchIn, now);
    try {
      await setDoc(doc(db, 'attendance', `${currentUser.uid}_${today}`), {
        punchOut: now,
        hours,
        punchOutLocation: location,
        ...(photoUrl ? { punchOutPhoto: photoUrl } : {}),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(`Punched out at ${now} · ${hours}h logged 👍`);
    } catch { toast.error('Failed to punch out'); }
    finally { setSaving(false); }
  }

  // ── Camera callbacks ─────────────────────────────────────────────────────────

  function onPhotoCaptured(blob: Blob) {
    const type = cameraFor;
    setCameraFor(null);
    if (type === 'in')  handlePunchIn(blob);
    if (type === 'out') handlePunchOut(blob);
  }

  // ── Stats (last 7 days) ────────────────────────────────────────────────────

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const withRec    = last7.filter(d => records[d] && d !== today);
  const onTimePct  = withRec.length
    ? Math.round(withRec.filter(d => records[d].status === 'on_time').length / withRec.length * 100)
    : 0;
  const totalHours = withRec.reduce((s, d) => s + (records[d].hours ?? 0), 0);
  const avgIn = (() => {
    const times = withRec.map(d => records[d].punchIn).filter(Boolean) as string[];
    if (!times.length) return '—';
    const mins = times.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
    const avg  = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
  })();

  // ── History (last 30 days, newest first) ─────────────────────────────────

  const historyDates = Array.from({ length: 31 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#1B2B5E]" />
      </div>
    );
  }

  const isGettingLocation = locState === 'requesting';

  // Live elapsed time for in-progress sessions (recomputed every second)
  const liveElapsed = (() => {
    if (!isPunchedIn || isPunchedOut || !todayRec?.punchIn) return null;
    const [ih, im] = todayRec.punchIn.split(':').map(Number);
    const now  = new Date();
    const totalSecs = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds())
                    - (ih * 3600 + im * 60);
    if (totalSecs < 0) return null;
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return {
      // e.g. "2h 14m" for the session banner
      short: h > 0 ? `${h}h ${m}m` : `${m}m`,
      // e.g. "02:14:09" for the header display
      clock: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`,
    };
  })();

  const liveHours = liveElapsed?.short ?? null; // kept for banner compatibility

  // Status accent colors — always derived from punch-in time, not stored field
  const todayStatus = todayRec ? displayStatus(todayRec) : null;
  const statusAccent = todayStatus === 'on_time' ? '#22c55e'
    : todayStatus === 'late'   ? '#f59e0b'
    : todayStatus === 'remote' ? '#3b82f6'
    : '#d1d5db';


  return (
    <div className="h-full overflow-y-auto bg-[#f4f6fb]">

      {/* ── Header ── */}
      <div className="bg-[#1B2B5E] relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-[#F5C518]/10 rounded-full pointer-events-none" />

        <div className="relative px-5 pt-6 pb-6 max-w-lg mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/40 text-[11px] font-semibold uppercase tracking-wider">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="text-white font-black text-xl mt-0.5">Attendance</h1>
            </div>
            {/* Live clock */}
            <div className="text-right">
              {/* HH:MM in large yellow, :SS smaller */}
              <p className="text-[#F5C518] font-mono font-black leading-none flex items-baseline justify-end gap-0.5">
                <span className="text-3xl">{liveTime.slice(0, 5)}</span>
                <span className="text-lg opacity-70">{liveTime.slice(5)}</span>
              </p>
              {/* Today's total work duration — ticks every second while session is live */}
              {isPunchedIn && !isPunchedOut && liveElapsed && (
                <div className="mt-1.5 text-right">
                  <p className="text-white/30 text-[9px] uppercase tracking-wider font-semibold">Today&apos;s work</p>
                  <p className="text-white font-mono font-black text-base leading-tight">
                    {liveElapsed.clock}
                  </p>
                </div>
              )}
              {isPunchedOut && todayRec?.hours != null && (
                <div className="mt-1.5 text-right">
                  <p className="text-white/30 text-[9px] uppercase tracking-wider font-semibold">Today&apos;s work</p>
                  <p className="text-[#F5C518]/80 font-mono font-black text-base leading-tight">
                    {String(Math.floor(todayRec.hours)).padStart(2,'0')}h {String(Math.round((todayRec.hours % 1) * 60)).padStart(2,'0')}m
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Status pill if punched in */}
          {todayRec && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusAccent }} />
              <span className="text-white/80 text-[11px] font-semibold">
                {STATUS_CFG[todayStatus!]?.label}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 pb-10 space-y-3 max-w-lg mx-auto">

        {/* ── Today's card ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Colored top stripe */}
          <div className="h-1 w-full" style={{ backgroundColor: statusAccent }} />

          <div className="p-4">

            {/* IN / OUT times */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {/* Punch In */}
              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className="w-5 h-5 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                    <LogIn size={11} className="text-white" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Punch In</span>
                </div>
                <p className={`font-black leading-none ${todayRec?.punchIn ? 'text-2xl text-emerald-700' : 'text-xl text-emerald-300'}`}>
                  {todayRec?.punchIn ?? '— : —'}
                </p>
                {todayRec?.punchInLocation ? (
                  <p className="text-[9px] text-emerald-500/80 mt-1.5 flex items-center gap-0.5 truncate">
                    <MapPin size={8} className="flex-shrink-0" />
                    {fmtCoords(todayRec.punchInLocation)}
                  </p>
                ) : (
                  <p className="text-[9px] text-emerald-300 mt-1.5">No location</p>
                )}
              </div>

              {/* Punch Out */}
              <div className={`rounded-xl border p-3.5 ${isPunchedOut ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${isPunchedOut ? 'bg-red-500' : 'bg-gray-300'}`}>
                    <LogOut size={11} className="text-white" />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isPunchedOut ? 'text-red-500' : 'text-gray-400'}`}>Punch Out</span>
                </div>
                <p className={`font-black leading-none ${isPunchedOut ? 'text-2xl text-red-600' : 'text-xl text-gray-300'}`}>
                  {todayRec?.punchOut ?? '— : —'}
                </p>
                {todayRec?.punchOutLocation ? (
                  <p className="text-[9px] text-red-400/80 mt-1.5 flex items-center gap-0.5 truncate">
                    <MapPin size={8} className="flex-shrink-0" />
                    {fmtCoords(todayRec.punchOutLocation)}
                  </p>
                ) : (
                  <p className={`text-[9px] mt-1.5 ${isPunchedOut ? 'text-red-300' : 'text-gray-300'}`}>No location</p>
                )}
              </div>
            </div>

            {/* Session status banner */}
            {isPunchedIn && !isPunchedOut && liveHours && (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-3.5 py-2.5 mb-3">
                <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-amber-700">Session in progress</p>
                  <p className="text-[10px] text-amber-500">Since {todayRec?.punchIn} · {liveHours} elapsed</p>
                </div>
              </div>
            )}
            {isPunchedOut && (
              <div className="flex items-center gap-2.5 bg-green-50 border border-green-100 rounded-xl px-3.5 py-2.5 mb-3">
                <CheckCircle2 size={15} className="text-green-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold text-green-700">Day complete</p>
                  <p className="text-[10px] text-green-500">{todayRec?.hours}h logged today</p>
                </div>
              </div>
            )}

            {/* Location error */}
            {(locState === 'denied' || locState === 'unavailable') && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-xl px-3.5 py-3 mb-3">
                <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-700">
                    {locState === 'denied' ? 'Location access denied' : 'Location unavailable'}
                  </p>
                  <p className="text-[11px] text-red-500 mt-0.5 leading-snug">
                    {locState === 'denied'
                      ? 'Allow location in your browser settings, then try again.'
                      : 'Check your GPS or network connection and try again.'}
                  </p>
                </div>
              </div>
            )}

            {/* Getting location */}
            {isGettingLocation && (
              <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 mb-3">
                <div className="relative flex-shrink-0">
                  <MapPin size={15} className="text-blue-500" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                </div>
                <p className="text-xs font-bold text-blue-600">Getting your location…</p>
              </div>
            )}

            {/* ── Action button ── */}
            {onApprovedLeave && !isPunchedIn ? (
              <div className="w-full py-4 rounded-2xl bg-violet-50 border border-violet-200 flex flex-col items-center justify-center gap-1.5">
                <div className="flex items-center gap-2 text-violet-700 font-bold text-sm">
                  <Calendar size={15} className="text-violet-500" />
                  You&apos;re on {leaveName} today
                </div>
                <span className="text-xs font-normal text-violet-400">Cannot mark attendance while on approved leave.</span>
              </div>
            ) : !isPunchedIn ? (
              <button
                onClick={() => setCameraFor('in')}
                disabled={saving || isGettingLocation}
                className="w-full py-4 rounded-2xl bg-[#1B2B5E] text-white font-black text-base hover:bg-[#2D4080] active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg shadow-[#1B2B5E]/20"
              >
                {isGettingLocation ? (
                  <><MapPin size={18} className="animate-bounce" />Locating…</>
                ) : saving ? (
                  <><Loader2 size={18} className="animate-spin" />Saving…</>
                ) : (
                  <><LogIn size={18} />Punch In</>
                )}
              </button>
            ) : !isPunchedOut ? (
              <button
                onClick={() => setShowPunchOutConfirm(true)}
                disabled={saving || isGettingLocation}
                className="w-full py-4 rounded-2xl bg-red-500 text-white font-black text-base hover:bg-red-600 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg shadow-red-500/20"
              >
                {isGettingLocation ? (
                  <><MapPin size={18} className="animate-bounce" />Locating…</>
                ) : saving ? (
                  <><Loader2 size={18} className="animate-spin" />Saving…</>
                ) : (
                  <><LogOut size={18} />Punch Out</>
                )}
              </button>
            ) : null}

            {/* Location notice */}
            {!isPunchedOut && !onApprovedLeave && (
              <p className="text-[10px] text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
                <MapPin size={9} />
                Location is required to mark attendance
              </p>
            )}
          </div>
        </div>

        {/* ── 7-day stats ── */}
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'On Time',  val: `${onTimePct}%`,                        icon: <Zap size={14} />,        bg: 'bg-emerald-500',  card: 'bg-emerald-50 border-emerald-100'   },
            { label: 'Avg In',   val: avgIn,                                   icon: <Clock size={14} />,      bg: 'bg-blue-500',     card: 'bg-blue-50 border-blue-100'         },
            { label: 'Hours',    val: `${Math.round(totalHours * 10) / 10}h`, icon: <TrendingUp size={14} />, bg: 'bg-violet-500',   card: 'bg-violet-50 border-violet-100'     },
          ].map(s => (
            <div key={s.label} className={`rounded-2xl border ${s.card} p-3.5 text-center`}>
              <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-2 text-white`}>
                {s.icon}
              </div>
              <p className="text-lg font-black text-gray-800 leading-none">{s.val}</p>
              <p className="text-[10px] font-semibold text-gray-400 mt-1">{s.label}</p>
              <p className="text-[9px] text-gray-300 mt-0.5">7 days</p>
            </div>
          ))}
        </div>

        {/* ── History ── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <div className="w-6 h-6 bg-[#1B2B5E]/8 rounded-lg flex items-center justify-center">
              <Calendar size={12} className="text-[#1B2B5E]" />
            </div>
            <p className="text-xs font-bold text-gray-600">History · Last 30 Days</p>
          </div>

          <div className="divide-y divide-gray-50">
            {historyDates.map(date => {
              const r = records[date];
              const isToday   = date === today;
              const d         = new Date(date + 'T00:00:00');
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              if (!r && isWeekend && !isToday) return null;
              const dayLabel  = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
              const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div
                  key={date}
                  className={`flex items-center px-4 py-3 gap-3 ${
                    isToday ? 'bg-[#1B2B5E]/[0.03] border-l-[3px] border-[#1B2B5E]' : isWeekend ? 'bg-gray-50/50' : ''
                  }`}
                >
                  {/* Date column */}
                  <div className="w-14 flex-shrink-0">
                    <p className={`text-xs font-bold ${isToday ? 'text-[#1B2B5E]' : isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>{dayLabel}</p>
                    <p className="text-[10px] text-gray-400">{dateLabel}</p>
                  </div>

                  {r ? (
                    <>
                      {/* Times */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="text-[11px] font-mono font-semibold text-gray-700 bg-gray-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
                          {r.punchIn ?? '—'}
                        </span>
                        <span className="text-gray-300 text-[9px] flex-shrink-0">→</span>
                        <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${r.punchOut ? 'text-gray-700 bg-gray-50' : 'text-gray-300 bg-gray-50'}`}>
                          {r.punchOut ?? '—'}
                        </span>
                        {r.hours > 0 && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0 ml-0.5">{r.hours}h</span>
                        )}
                        {isToday && r.punchIn && !r.punchOut && (
                          <span className="text-[9px] text-amber-500 font-bold animate-pulse flex-shrink-0">● live</span>
                        )}
                        {r.punchInLocation && (
                          <MapPin size={9} className="text-emerald-400 flex-shrink-0 ml-auto" />
                        )}
                      </div>
                      {/* Status badge */}
                      <span className={`text-[9px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_CFG[displayStatus(r)]?.bg} ${STATUS_CFG[displayStatus(r)]?.text}`}>
                        {STATUS_CFG[displayStatus(r)]?.label}
                      </span>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-[11px] text-gray-300">
                        {isToday ? 'Not punched in yet' : isWeekend ? 'Weekend' : 'No record'}
                      </span>
                      {!isToday && !isWeekend && (
                        <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-400">Absent</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Camera Selfie Modal ── */}
      {cameraFor && (
        <CameraCapture
          punchType={cameraFor}
          onCapture={onPhotoCaptured}
          onCancel={() => setCameraFor(null)}
        />
      )}

      {/* ── Punch Out Confirmation (bottom sheet on mobile) ── */}
      {showPunchOutConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center sm:items-center" onClick={() => setShowPunchOutConfirm(false)}>
          <div
            className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Handle bar (mobile) */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="h-1 bg-gradient-to-r from-red-400 via-red-500 to-red-600 sm:rounded-none" />
            <div className="p-6">
              <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogOut size={28} className="text-red-500" />
              </div>
              <h3 className="text-xl font-black text-gray-900 text-center">Punch Out?</h3>
              <p className="text-sm text-gray-500 text-center mt-2 leading-relaxed">
                Leaving at <span className="font-black text-gray-800">{liveTime}</span>
                {todayRec?.punchIn && (
                  <> · in since <span className="font-black text-gray-800">{todayRec.punchIn}</span>
                  {liveHours && <span className="text-gray-400"> ({liveHours})</span>}</>
                )}.
              </p>
              <p className="text-[11px] text-gray-400 text-center mt-1.5 flex items-center justify-center gap-1">
                <MapPin size={10} />Your location will be recorded
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPunchOutConfirm(false)}
                  className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowPunchOutConfirm(false); setCameraFor('out'); }}
                  disabled={saving}
                  className="flex-1 py-3.5 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-sm font-black active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                  Punch Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
