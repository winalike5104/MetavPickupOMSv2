import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc, collection } from 'firebase/firestore';
import { X, Save, Loader2, Megaphone } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { logAction } from '../utils';

interface Announcement {
  id?: string;
  content: string;
  link?: string;
  isActive: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentAnnouncement: Announcement | null;
  onUpdate: () => void;
}

export const AnnouncementModal: React.FC<Props> = ({ isOpen, onClose, currentAnnouncement, onUpdate }) => {
  const { profile } = useAuth();
  const [content, setContent] = useState(currentAnnouncement?.content || '');
  const [link, setLink] = useState(currentAnnouncement?.link || '');
  const [isActive, setIsActive] = useState(currentAnnouncement?.isActive ?? true);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);

    try {
      const announcementRef = doc(db, 'announcements', 'current');
      await setDoc(announcementRef, {
        content,
        link,
        isActive,
        updatedAt: new Date().toISOString(),
        updatedBy: profile.name
      });

      await logAction(profile, 'Update Announcement', `Updated system announcement: ${content.substring(0, 20)}...`);
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating announcement:', error);
      alert('Failed to update announcement');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
              <Megaphone className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">System Announcement</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Announcement Content</label>
            <textarea
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter announcement text..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[120px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Link (Optional)</label>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com/updates"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-slate-700">Display on Dashboard</label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
