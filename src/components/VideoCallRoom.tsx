import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Clock,
  Wifi,
  WifiOff,
  ArrowLeft,
} from 'lucide-react';
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { CATEGORY_LABELS, CounselingSchedule } from '../types/index.ts';
import { formatDateId } from '../lib/timeWindow.ts';

interface VideoCallRoomProps {
  schedule: CounselingSchedule;
  onExit: () => void;
}

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

type CallStage = 'lobby' | 'connecting' | 'in_call' | 'disconnected' | 'ended' | 'error';

export const VideoCallRoom: React.FC<VideoCallRoomProps> = ({ schedule, onExit }) => {
  const { firebaseUser, userAccount, pushToast, sendNotification } = useAuth();

  const [stage, setStage] = useState<CallStage>('lobby');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);

  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('');

  const [camEnabled, setCamEnabled] = useState(true);
  const [micEnabled, setMicEnabled] = useState(true);
  const [micLevel, setMicLevel] = useState(0);

  const [peerConnected, setPeerConnected] = useState(false);
  const [peerJoining, setPeerJoining] = useState(false);
  const [peerName, setPeerName] = useState<string>(
    userAccount?.uid === schedule.studentUid ? schedule.counselorName : schedule.studentName
  );
  const [peerMediaState, setPeerMediaState] = useState<{ audio: boolean; video: boolean }>({
    audio: true,
    video: true,
  });
  const [connectionState, setConnectionState] = useState<string>('Menunggu');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const roomMetaRef = useRef<{
    roomToken: string;
    roomId: string;
    participantRole: 'student' | 'counselor';
    participantName: string;
    iceServers: RTCIceServer[];
  } | null>(null);
  const audioAnalyserCleanupRef = useRef<(() => void) | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  const attachLocalPreview = useCallback((stream: MediaStream | null) => {
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
    }
  }, []);

  const setupMicMeter = useCallback((stream: MediaStream) => {
    audioAnalyserCleanupRef.current?.();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMicLevel(0);
      return;
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let active = true;
      let raf = 0;

      const tick = () => {
        if (!active) return;
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 90) * 100)));
        raf = requestAnimationFrame(tick);
      };
      tick();

      audioAnalyserCleanupRef.current = () => {
        active = false;
        cancelAnimationFrame(raf);
        ctx.close().catch(() => {});
      };
    } catch {
      // Ignore WebAudio restrictions
    }
  }, []);

  const initDevicesAndPreview = useCallback(
    async (camId?: string, micId?: string) => {
      setDeviceWarning(null);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDeviceWarning(
          'Browser Anda tidak mendukung akses kamera/mikrofon atau halaman tidak menggunakan HTTPS.'
        );
        return;
      }

      const videoConstraint: boolean | MediaTrackConstraints = camId
        ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
      const audioConstraint: boolean | MediaTrackConstraints = micId
        ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true };

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
          audio: audioConstraint,
        });
      } catch {
        // Fallback to audio-only if camera missing or blocked
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
          setCamEnabled(false);
          setDeviceWarning('Kamera tidak tersedia atau izin ditolak. Sesi akan menggunakan audio saja.');
        } catch {
          setCamEnabled(false);
          setMicEnabled(false);
          setDeviceWarning(
            'Kamera dan mikrofon tidak dapat diakses. Periksa izin perangkat pada browser Anda sebelum bergabung.'
          );
        }
      }

      if (stream) {
        localStreamRef.current = stream;
        attachLocalPreview(stream);
        setupMicMeter(stream);
      }

      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const videoList = list
          .filter((d) => d.kind === 'videoinput')
          .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${idx + 1}` }));
        const audioList = list
          .filter((d) => d.kind === 'audioinput')
          .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${idx + 1}` }));
        setCameras(videoList);
        setMics(audioList);
        if (!camId && videoList[0]) setSelectedCameraId(videoList[0].deviceId);
        if (!micId && audioList[0]) setSelectedMicId(audioList[0].deviceId);
      } catch {
        // ignore device enumeration restrictions
      }
    },
    [attachLocalPreview, setupMicMeter]
  );

  useEffect(() => {
    initDevicesAndPreview();
    return () => {
      audioAnalyserCleanupRef.current?.();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
      wsRef.current?.close();
    };
  }, [initDevicesAndPreview]);

  // Keep local video ref bound when stage transitions
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [stage, peerConnected]);

  // Session duration timer
  useEffect(() => {
    if (stage !== 'in_call') return;
    if (!sessionStartRef.current) {
      sessionStartRef.current = Date.now();
    }
    const timer = setInterval(() => {
      if (sessionStartRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [stage]);

  const formatDuration = (sec: number) => {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const logVideoEvent = useCallback(
    async (
      roomId: string,
      role: 'student' | 'counselor',
      eventType: 'joined' | 'reconnected' | 'left' | 'ended'
    ) => {
      if (!firebaseUser) return;
      try {
        await addDoc(collection(db, 'videoSessionLogs'), {
          roomId,
          scheduleId: schedule.id,
          participantUid: firebaseUser.uid,
          participantRole: role,
          eventType,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not log video event:', err);
      }
    },
    [firebaseUser, schedule.id]
  );

  const createPeerConnection = useCallback(
    (iceServers: RTCIceServer[], ws: WebSocket) => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setPeerConnected(true);
        setPeerJoining(false);
        setConnectionState('Terhubung');
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc:ice-candidate',
              candidate: event.candidate.toJSON(),
            })
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === 'connected' || state === 'completed') {
          setConnectionState('Terhubung');
          setPeerConnected(true);
          setStage('in_call');
        } else if (state === 'checking') {
          setConnectionState('Menghubungkan...');
        } else if (state === 'disconnected') {
          setConnectionState('Koneksi Terputus');
          setStage('disconnected');
        } else if (state === 'failed') {
          setConnectionState('Koneksi Gagal');
          setStage('disconnected');
          pc.restartIce();
        }
      };

      return pc;
    },
    []
  );

  const connectToRoom = useCallback(
    async (isReconnect = false) => {
      if (!firebaseUser) return;
      setErrorMessage(null);
      setStage('connecting');
      setConnectionState(isReconnect ? 'Menghubungkan Ulang...' : 'Memverifikasi Ruang...');

      try {
        const idToken = await firebaseUser.getIdToken();
        const resp = await fetch('/api/video/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ scheduleId: schedule.id }),
        });

        const data = await resp.json();
        if (!resp.ok) {
          setErrorMessage(data.error || 'Gagal mengakses ruang konseling.');
          setStage('error');
          return;
        }

        roomMetaRef.current = {
          roomToken: data.roomToken,
          roomId: data.roomId,
          participantRole: data.participantRole,
          participantName: data.participantName,
          iceServers: data.iceServers,
        };
        if (data.peerName) setPeerName(data.peerName);

        // Update Firestore schedule & room status to active/in_progress
        const nowIso = new Date().toISOString();
        updateDoc(doc(db, 'counselingSchedules', schedule.id), {
          status: 'in_progress',
          startedAt: schedule.startedAt || nowIso,
          updatedAt: serverTimestamp(),
        }).catch(() => {});

        if (schedule.videoRoomId) {
          updateDoc(doc(db, 'videoRooms', schedule.videoRoomId), {
            status: 'active',
            startedAt: nowIso,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        logVideoEvent(data.roomId, data.participantRole, isReconnect ? 'reconnected' : 'joined');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsRef.current?.close();
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          setStage('in_call');
          setConnectionState('Menunggu Peserta');
          ws.send(
            JSON.stringify({
              type: 'join',
              roomToken: data.roomToken,
              mediaState: { audio: micEnabled, video: camEnabled },
            })
          );
        };

        ws.onmessage = async (event) => {
          let msg: any;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }

          if (msg.type === 'room:error') {
            setErrorMessage(msg.message);
            setStage('error');
            return;
          }

          if (msg.type === 'room:joined') {
            const pc = createPeerConnection(data.iceServers, ws);
            if (msg.peers && msg.peers.length > 0) {
              const other = msg.peers[0];
              setPeerName(other.displayName || peerName);
              setPeerMediaState(other.mediaState || { audio: true, video: true });
              setPeerJoining(true);
              // Deterministic offer initiator: smaller UID initiates SDP offer
              if (firebaseUser.uid < other.uid) {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: 'webrtc:offer', sdp: offer }));
              }
            }
            return;
          }

          if (msg.type === 'peer:joined') {
            setPeerName(msg.peer.displayName || peerName);
            setPeerMediaState(msg.peer.mediaState || { audio: true, video: true });
            setPeerJoining(true);
            const pc = createPeerConnection(data.iceServers, ws);
            if (firebaseUser.uid < msg.peer.uid) {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              ws.send(JSON.stringify({ type: 'webrtc:offer', sdp: offer }));
            }
            return;
          }

          if (msg.type === 'webrtc:offer') {
            const pc = pcRef.current || createPeerConnection(data.iceServers, ws);
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            for (const cand of iceQueueRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            iceQueueRef.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'webrtc:answer', sdp: answer }));
            return;
          }

          if (msg.type === 'webrtc:answer') {
            const pc = pcRef.current;
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              for (const cand of iceQueueRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
              iceQueueRef.current = [];
            }
            return;
          }

          if (msg.type === 'webrtc:ice-candidate' && msg.candidate) {
            const pc = pcRef.current;
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
            } else {
              iceQueueRef.current.push(msg.candidate);
            }
            return;
          }

          if (msg.type === 'media:state') {
            setPeerMediaState(msg.mediaState || { audio: true, video: true });
            return;
          }

          if (msg.type === 'peer:left') {
            setPeerConnected(false);
            setPeerJoining(false);
            setConnectionState('Peserta Keluar');
            pushToast('Peserta Keluar', `${peerName} meninggalkan ruang konseling.`, 'info');
            return;
          }

          if (msg.type === 'session:ended') {
            localStreamRef.current?.getTracks().forEach((t) => t.stop());
            pcRef.current?.close();
            setStage('ended');
          }
        };

        ws.onerror = () => {
          setConnectionState('Koneksi Terputus');
          setStage((prev) => (prev === 'ended' ? 'ended' : 'disconnected'));
        };

        ws.onclose = () => {
          setStage((prev) => {
            if (prev === 'in_call') {
              setConnectionState('Koneksi Terputus');
              return 'disconnected';
            }
            return prev;
          });
        };
      } catch (err: any) {
        setErrorMessage(err?.message || 'Gagal menghubungkan ke ruang video call.');
        setStage('error');
      }
    },
    [
      firebaseUser,
      schedule,
      micEnabled,
      camEnabled,
      createPeerConnection,
      logVideoEvent,
      peerName,
      pushToast,
    ]
  );

  const toggleCamera = () => {
    const next = !camEnabled;
    setCamEnabled(next);
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'media:state', mediaState: { audio: micEnabled, video: next } })
      );
    }
  };

  const toggleMic = () => {
    const next = !micEnabled;
    setMicEnabled(next);
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({ type: 'media:state', mediaState: { audio: next, video: camEnabled } })
      );
    }
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleEndSession = async () => {
    setConfirmEndOpen(false);
    const endIso = new Date().toISOString();

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'session:ended' }));
    }

    if (roomMetaRef.current) {
      await logVideoEvent(
        roomMetaRef.current.roomId,
        roomMetaRef.current.participantRole,
        'ended'
      );
    }

    try {
      await updateDoc(doc(db, 'counselingSchedules', schedule.id), {
        status: 'completed',
        endedAt: endIso,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'counselingRequests', schedule.requestId), {
        status: 'completed',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      if (schedule.videoRoomId) {
        await updateDoc(doc(db, 'videoRooms', schedule.videoRoomId), {
          status: 'ended',
          endedAt: endIso,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await sendNotification({
        targetUid: schedule.studentUid,
        targetRole: 'student',
        title: 'Sesi Konseling Selesai',
        message: `Sesi ${CATEGORY_LABELS[schedule.category]} bersama ${schedule.counselorName} telah selesai.`,
        type: 'session',
      });
      await sendNotification({
        targetUid: schedule.counselorUid,
        targetRole: 'counselor',
        title: 'Sesi Konseling Selesai',
        message: `Sesi bersama ${schedule.studentName} telah ditandai selesai.`,
        type: 'session',
      });
    } catch (err) {
      console.error('Error finalizing session:', err);
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    wsRef.current?.close();
    setStage('ended');
  };

  const handleDeviceChange = async (camId: string, micId: string) => {
    setSelectedCameraId(camId);
    setSelectedMicId(micId);
    await initDevicesAndPreview(camId, micId);
  };

  return (
    <div ref={containerRef} className="min-h-[calc(100vh-72px)] bg-[#1B2620] text-[#F7F4EC] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        {/* Top Session Info Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#344A3E] bg-[#223029] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#3E5649] bg-[#2A3B32] px-3 py-1.5 text-xs font-medium text-[#EBF0EC] hover:bg-[#344A3E]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Kembali</span>
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-semibold text-white">
                Ruang Konseling Virtual · {CATEGORY_LABELS[schedule.category]}
              </h1>
              <p className="text-xs text-[#A3B8A5] tabular-nums">
                {formatDateId(schedule.date)} · {schedule.startTime}–{schedule.endTime} WIB · Peserta: {peerName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-[#D4E0D5]">
              {connectionState === 'Koneksi Terputus' || connectionState === 'Koneksi Gagal' ? (
                <WifiOff className="h-4 w-4 text-amber-400" />
              ) : (
                <Wifi className="h-4 w-4 text-[#A3B8A5]" />
              )}
              <span>{connectionState}</span>
            </div>
            {stage === 'in_call' && (
              <div className="flex items-center gap-1.5 font-mono tabular-nums text-white bg-[#315E4B] px-3 py-1.5 rounded-lg">
                <Clock className="h-3.5 w-3.5" />
                <span>{formatDuration(elapsedSeconds)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="flex items-center gap-2.5 rounded-lg border border-[#344A3E] bg-[#223029]/70 px-4 py-2.5 text-xs text-[#D4E0D5]">
          <ShieldCheck className="h-4 w-4 text-[#A3B8A5] shrink-0" />
          <span>
            Koneksi peer-to-peer terenkripsi. Ruang ini tidak melakukan perekaman video maupun audio secara otomatis demi menjaga kerahasiaan konseling.
          </span>
        </div>

        {/* Stage: Pre-call Lobby */}
        {stage === 'lobby' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 rounded-2xl border border-[#344A3E] bg-[#141D18] overflow-hidden relative min-h-[340px] flex items-center justify-center">
              {camEnabled ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center p-6">
                  <VideoOff className="h-12 w-12 text-[#A3B8A5]" />
                  <p className="text-sm text-[#D4E0D5]">Kamera dinonaktifkan</p>
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span className="rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
                  Pratinjau Kamera Anda
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleMic}
                    className={`rounded-lg p-2.5 text-white transition-colors ${
                      micEnabled ? 'bg-[#315E4B] hover:bg-[#244738]' : 'bg-red-600 hover:bg-red-700'
                    }`}
                    aria-label={micEnabled ? 'Bisukan mikrofon' : 'Aktifkan mikrofon'}
                  >
                    {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className={`rounded-lg p-2.5 text-white transition-colors ${
                      camEnabled ? 'bg-[#315E4B] hover:bg-[#244738]' : 'bg-red-600 hover:bg-red-700'
                    }`}
                    aria-label={camEnabled ? 'Matikan kamera' : 'Nyalakan kamera'}
                  >
                    {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#344A3E] bg-[#223029] p-6 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-white">Pengaturan Perangkat Sebelum Bergabung</h2>
                {deviceWarning && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-950/50 p-3 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{deviceWarning}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#D4E0D5] mb-1.5">Pilih Kamera</label>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleDeviceChange(e.target.value, selectedMicId)}
                    className="w-full rounded-lg border border-[#3E5649] bg-[#1B2620] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#A3B8A5]"
                  >
                    {cameras.length === 0 ? (
                      <option value="">Kamera tidak terdeteksi</option>
                    ) : (
                      cameras.map((cam) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          {cam.label}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#D4E0D5] mb-1.5">Pilih Mikrofon</label>
                  <select
                    value={selectedMicId}
                    onChange={(e) => handleDeviceChange(selectedCameraId, e.target.value)}
                    className="w-full rounded-lg border border-[#3E5649] bg-[#1B2620] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#A3B8A5]"
                  >
                    {mics.length === 0 ? (
                      <option value="">Mikrofon tidak terdeteksi</option>
                    ) : (
                      mics.map((m) => (
                        <option key={m.deviceId} value={m.deviceId}>
                          {m.label}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-[#1B2620] overflow-hidden">
                    <div
                      className="h-full bg-[#A3B8A5] transition-all duration-75"
                      style={{ width: `${micEnabled ? micLevel : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => connectToRoom(false)}
                  className="w-full rounded-xl bg-[#315E4B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#3e755e] transition-colors"
                >
                  Masuk ke Ruang Konseling
                </button>
                <button
                  type="button"
                  onClick={() => initDevicesAndPreview(selectedCameraId, selectedMicId)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#3E5649] bg-transparent px-4 py-2.5 text-xs font-medium text-[#D4E0D5] hover:bg-[#2A3B32]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Uji Ulang Kamera & Mikrofon</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stage: Connecting or Error */}
        {stage === 'connecting' && (
          <div className="rounded-2xl border border-[#344A3E] bg-[#223029] p-12 text-center space-y-4">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#A3B8A5] border-t-transparent" />
            <p className="text-base font-medium text-white">{connectionState}</p>
            <p className="text-xs text-[#A3B8A5]">Memverifikasi jadwal dan menyiapkan saluran terenkripsi...</p>
          </div>
        )}

        {stage === 'error' && (
          <div className="rounded-2xl border border-red-500/40 bg-[#2A1F1F] p-8 text-center space-y-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-red-400" />
            <h2 className="text-lg font-semibold text-white">Tidak Dapat Memasuki Ruang</h2>
            <p className="text-sm text-red-200 max-w-lg mx-auto">{errorMessage}</p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStage('lobby')}
                className="rounded-lg bg-[#315E4B] px-4 py-2 text-sm font-medium text-white hover:bg-[#244738]"
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={onExit}
                className="rounded-lg border border-[#3E5649] px-4 py-2 text-sm font-medium text-[#D4E0D5]"
              >
                Kembali ke Dashboard
              </button>
            </div>
          </div>
        )}

        {/* Stage: In Call / Disconnected */}
        {(stage === 'in_call' || stage === 'disconnected') && (
          <div className="space-y-4">
            {stage === 'disconnected' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/50 bg-amber-950/60 px-4 py-3 text-sm text-amber-100">
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-amber-400" />
                  <span>Koneksi terputus sementara. Anda dapat bergabung kembali ke ruang konseling.</span>
                </div>
                <button
                  type="button"
                  onClick={() => connectToRoom(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Gabung Kembali</span>
                </button>
              </div>
            )}

            {/* Video Grid */}
            <div className="relative rounded-2xl border border-[#344A3E] bg-[#141D18] overflow-hidden min-h-[420px] sm:min-h-[520px] flex items-center justify-center">
              {/* Remote Participant Stream */}
              {peerConnected ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-full w-full max-h-[600px] object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center">
                  <UserCheck className="h-12 w-12 text-[#A3B8A5]" />
                  <p className="text-base font-medium text-white">
                    {peerJoining
                      ? `${peerName} sedang bergabung ke ruang konseling...`
                      : `Menunggu ${peerName} bergabung ke ruang konseling...`}
                  </p>
                  <p className="text-xs text-[#A3B8A5] max-w-md">
                    Pastikan jadwal sudah memasuki waktu sesi. Video akan terhubung otomatis begitu kedua peserta hadir.
                  </p>
                </div>
              )}

              {/* Remote Name & Media Indicator */}
              <div className="absolute top-4 left-4 flex items-center gap-2 rounded-lg bg-black/65 px-3 py-1.5 text-xs text-white">
                <span>{peerName}</span>
                {!peerMediaState.audio && <MicOff className="h-3.5 w-3.5 text-red-400" />}
                {!peerMediaState.video && <VideoOff className="h-3.5 w-3.5 text-amber-400" />}
              </div>

              {/* Local Self-View PiP */}
              <div className="absolute bottom-4 right-4 w-36 sm:w-52 aspect-video rounded-xl border border-[#3E5649] bg-[#1E2B24] overflow-hidden shadow-lg">
                {camEnabled ? (
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-xs text-[#A3B8A5] gap-1">
                    <VideoOff className="h-5 w-5" />
                    <span>Kamera Mati</span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-2 rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">
                  Anda ({userAccount?.role === 'counselor' ? 'Konselor' : 'Mahasiswa'})
                </div>
              </div>
            </div>

            {/* Call Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-[#344A3E] bg-[#223029] px-6 py-4">
              <button
                type="button"
                onClick={toggleMic}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  micEnabled
                    ? 'bg-[#2E4237] text-white hover:bg-[#3A5245]'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                <span>{micEnabled ? 'Bisukan' : 'Aktifkan Mikrofon'}</span>
              </button>

              <button
                type="button"
                onClick={toggleCamera}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                  camEnabled
                    ? 'bg-[#2E4237] text-white hover:bg-[#3A5245]'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                <span>{camEnabled ? 'Matikan Kamera' : 'Nyalakan Kamera'}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex items-center gap-2 rounded-xl bg-[#2E4237] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3A5245] transition-colors"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                <span>{isFullscreen ? 'Keluar Layar Penuh' : 'Layar Penuh'}</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmEndOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                <PhoneOff className="h-4 w-4" />
                <span>Akhiri Sesi</span>
              </button>
            </div>
          </div>
        )}

        {/* Stage: Ended */}
        {stage === 'ended' && (
          <div className="rounded-2xl border border-[#344A3E] bg-[#223029] p-10 text-center space-y-4">
            <ShieldCheck className="mx-auto h-12 w-12 text-[#A3B8A5]" />
            <h2 className="text-xl font-semibold text-white">Sesi Konseling Telah Selesai</h2>
            <p className="text-sm text-[#D4E0D5] max-w-md mx-auto">
              Status jadwal telah diperbarui menjadi selesai dengan durasi {formatDuration(elapsedSeconds)}. Terima kasih telah menggunakan Ruang Tumbuh Lab BK UNUGHA.
            </p>
            <button
              type="button"
              onClick={onExit}
              className="rounded-xl bg-[#315E4B] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
            >
              Kembali ke Dashboard
            </button>
          </div>
        )}

        {/* Confirmation Dialog before Ending Session */}
        {confirmEndOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-w-md w-full rounded-2xl border border-[#344A3E] bg-[#223029] p-6 space-y-4 text-white">
              <h3 className="text-lg font-semibold">Akhiri Sesi Konseling?</h3>
              <p className="text-sm text-[#D4E0D5]">
                Mengakhiri sesi akan menutup panggilan video untuk kedua peserta dan mengubah status jadwal menjadi selesai.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmEndOpen(false)}
                  className="rounded-lg border border-[#3E5649] px-4 py-2 text-sm font-medium text-[#D4E0D5]"
                >
                  Lanjutkan Sesi
                </button>
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Ya, Akhiri Sesi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
