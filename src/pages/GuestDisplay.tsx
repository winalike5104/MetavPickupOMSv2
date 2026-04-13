import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../constants';
import { io, Socket } from 'socket.io-client';
import SignatureCanvas from 'react-signature-canvas';
import html2canvas from 'html2canvas-pro';
import { X, Check, Megaphone, User, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const GuestDisplay = () => {
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [pairingId, setPairingId] = useState<string>('');
  const [isJoined, setIsJoined] = useState(false);
  const [request, setRequest] = useState<{ orderId: string; bookingNumber: string; customerName: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const sigPad = useRef<SignatureCanvas>(null);
  const signatureAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Try to get pairingId or storeId from URL or localStorage
    const params = new URLSearchParams(window.location.search);
    const urlPairingId = params.get('pairingId');
    const urlStoreId = params.get('storeId');
    const savedPairingId = localStorage.getItem('guest_display_pairing_id');
    const savedStoreId = localStorage.getItem('guest_display_store_id');
    
    if (urlPairingId) {
      setPairingId(urlPairingId);
      localStorage.setItem('guest_display_pairing_id', urlPairingId);
      setIsJoined(true);
    } else if (urlStoreId) {
      setPairingId(urlStoreId);
      localStorage.setItem('guest_display_store_id', urlStoreId);
      setIsJoined(true);
    } else if (savedPairingId) {
      setPairingId(savedPairingId);
      setIsJoined(true);
    } else if (savedStoreId) {
      setPairingId(savedStoreId);
      setIsJoined(true);
    }

    const newSocket = io(API_BASE_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      const pid = urlPairingId || savedPairingId;
      const sid = urlStoreId || savedStoreId;
      if (pid) {
        const roomId = `pair_${pid}`;
        newSocket.emit('join-room', roomId);
        newSocket.emit('guest-online', roomId);
      } else if (sid) {
        const roomId = `store_${sid}`;
        newSocket.emit('join-room', roomId);
        newSocket.emit('guest-online', roomId);
      }
    });

    newSocket.on('show-signature-pad', (data) => {
      setRequest(data);
    });

    newSocket.on('reset-guest-display', () => {
      setRequest(null);
      setSubmitting(false);
    });

    newSocket.on('check-guest-presence', (data) => {
      // If we are joined, announce we are online
      const pid = localStorage.getItem('guest_display_pairing_id');
      const sid = localStorage.getItem('guest_display_store_id');
      if (pid) {
        newSocket.emit('guest-online', `pair_${pid}`);
      } else if (sid) {
        newSocket.emit('guest-online', `store_${sid}`);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const joinRoom = () => {
    if (socket && pairingId) {
      // If it looks like a storeId (contains underscores or letters), use store_ prefix
      // Otherwise default to pair_ for backward compatibility with numeric passwords
      const isStoreId = /^[A-Z_]+[0-9]*$/.test(pairingId);
      const roomId = isStoreId ? `store_${pairingId}` : `pair_${pairingId}`;
      
      socket.emit('join-room', roomId);
      socket.emit('guest-online', roomId);
      setIsJoined(true);
      
      if (isStoreId) {
        localStorage.setItem('guest_display_store_id', pairingId);
        localStorage.removeItem('guest_display_pairing_id');
      } else {
        localStorage.setItem('guest_display_pairing_id', pairingId);
        localStorage.removeItem('guest_display_store_id');
      }
    }
  };

  const resetConnection = () => {
    localStorage.removeItem('guest_display_pairing_id');
    localStorage.removeItem('guest_display_store_id');
    setPairingId('');
    setIsJoined(false);
    setRequest(null);
  };

  const clear = () => sigPad.current?.clear();

  const submit = async () => {
    if (!sigPad.current || sigPad.current.isEmpty() || !request || !socket) return;
    
    setSubmitting(true);
    
    let signatureData = '';
    if (signatureAreaRef.current) {
      const canvas = await html2canvas(signatureAreaRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });
      signatureData = canvas.toDataURL('image/png');
    } else {
      signatureData = sigPad.current.toDataURL();
    }
    
    const pid = localStorage.getItem('guest_display_pairing_id');
    const sid = localStorage.getItem('guest_display_store_id');
    const roomId = pid ? `pair_${pid}` : `store_${sid}`;
    
    socket.emit('submit-signature', {
      orderId: request.orderId,
      storeId: roomId,
      signatureData: signatureData
    });

    // Reset after a short delay
    setTimeout(() => {
      setRequest(null);
      setSubmitting(false);
    }, 2000);
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <button 
          onClick={() => navigate('/')}
          className="absolute top-8 left-8 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-bold transition-all backdrop-blur-md z-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
              <Megaphone className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Guest Display Pairing</h1>
          </div>
          <p className="text-slate-500 mb-6 text-sm">Enter the Pairing Password set on your terminal to connect this display.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Pairing Password</label>
              <input
                type="text"
                value={pairingId}
                onChange={(e) => setPairingId(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xl font-bold text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-center tracking-widest"
                placeholder="e.g. 123456"
              />
            </div>
            <button
              onClick={joinRoom}
              disabled={!pairingId}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-indigo-200 disabled:opacity-50"
            >
              Pair Display
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 overflow-hidden">
      <AnimatePresence mode="wait">
        {!request ? (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="text-center"
          >
            <div className="absolute top-8 right-8 flex gap-4">
              <button 
                onClick={() => navigate('/')}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-md flex items-center gap-2"
              >
                <ArrowLeft className="w-3 h-3" />
                Dashboard
              </button>
              <button 
                onClick={resetConnection}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-md"
              >
                Unpair Display
              </button>
            </div>
            <div className="w-32 h-32 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
              <Megaphone className="w-12 h-12 text-indigo-400" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-4">Welcome</h2>
            <p className="text-slate-400 text-xl">Waiting for your order confirmation...</p>
            <div className="mt-12 flex items-center justify-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }}></div>
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '400ms' }}></div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="signature"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="w-full max-w-4xl bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col"
            style={{ height: '80vh' }}
          >
            <div className="p-8 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-indigo-100 text-sm font-bold uppercase tracking-wider">Please Sign Below</p>
                  <h3 className="text-3xl font-bold">{request.customerName}</h3>
                </div>
              </div>
              <div className="text-right">
                <p className="text-indigo-200 text-xs font-bold uppercase">Booking Number</p>
                <p className="text-xl font-mono font-bold">{request.bookingNumber}</p>
              </div>
            </div>

            <div ref={signatureAreaRef} className="flex-1 relative bg-slate-50">
              {submitting ? (
                <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
                    <Check className="w-10 h-10" />
                  </div>
                  <h4 className="text-2xl font-bold text-slate-900">Thank You!</h4>
                  <p className="text-slate-500">Signature submitted successfully.</p>
                </div>
              ) : (
                <SignatureCanvas
                  ref={sigPad}
                  penColor="#1e1b4b"
                  canvasProps={{
                    className: 'sigPad w-full h-full cursor-crosshair'
                  }}
                />
              )}
            </div>

            <div className="p-8 bg-slate-50 border-t border-slate-200 flex gap-6">
              <button
                onClick={clear}
                disabled={submitting}
                className="flex-1 py-6 rounded-3xl border-2 border-slate-200 text-slate-600 font-bold text-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-3"
              >
                <X className="w-6 h-6" />
                Clear
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-6 rounded-3xl font-bold text-2xl transition-all shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3"
              >
                <Check className="w-8 h-8" />
                Confirm Signature
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="fixed bottom-8 left-8 flex items-center gap-3 text-slate-600">
        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
        <span className="text-sm font-bold tracking-widest uppercase">Display Connected: {pairingId}</span>
      </div>
    </div>
  );
};
