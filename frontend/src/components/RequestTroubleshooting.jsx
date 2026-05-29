// frontend/src/components/RequestTroubleshooting.jsx
// Shown in Supervisor & Student dashboards — read-only view of office user's tick progress.
import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { getSocket } from '../utils/socket';

export default function RequestTroubleshooting({ requestId, className = '' }) {
  const [steps, setSteps] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [stepsUpdatedAt, setStepsUpdatedAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolved, setIsResolved] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setShowPopover(false);
    };
    if (showPopover) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  const fetchSteps = async () => {
    if (!requestId) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/requests/${requestId}/troubleshooting-steps`);
      if (res.data.isResolved) {
        setIsResolved(true); setSteps(null);
      } else if (res.data.steps?.length > 0) {
        setSteps(res.data.steps);
        setCompletedSteps(res.data.completedSteps || []);
        setStepsUpdatedAt(res.data.stepsUpdatedAt);
        setIsResolved(false);
      } else {
        setSteps(null);
      }
    } catch (err) {
      console.error('Failed to fetch troubleshooting steps:', err);
      setSteps(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSteps(); }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    const socket = getSocket();
    if (!socket) return;

    const handleProgressUpdate = (data) => {
      if (data.requestId === requestId) {
        setCompletedSteps(data.completedSteps || []);
        setStepsUpdatedAt(data.updatedAt);
      }
    };
    const handleTroubleshootingUpdate = (data) => {
      if (data.requestId === requestId) {
        setSteps(data.steps); setIsResolved(false); setIsLoading(false);
      }
    };

    socket.on('step-progress-updated', handleProgressUpdate);
    socket.on('troubleshooting-updated', handleTroubleshootingUpdate);
    return () => {
      socket.off('step-progress-updated', handleProgressUpdate);
      socket.off('troubleshooting-updated', handleTroubleshootingUpdate);
    };
  }, [requestId]);

  if (isResolved || !steps || steps.length === 0) return null;

  const triedCount = completedSteps.length;
  const totalCount = steps.length;
  const allDone = triedCount === totalCount;

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition font-medium ${
          allDone ? 'bg-green-500 hover:bg-green-600 text-white'
          : triedCount > 0 ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
          : 'bg-blue-500 hover:bg-blue-600 text-white'
        }`}
        title="View office user's troubleshooting progress"
      >
        <span>🛠️</span>
        <span>Steps</span>
        <span className="bg-white bg-opacity-30 rounded px-1 text-xs">{triedCount}/{totalCount}</span>
        <span>{showPopover ? '▲' : '▼'}</span>
      </button>

      {showPopover && (
        <div ref={popoverRef}
          className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-2xl border border-gray-200 w-80 max-h-[32rem] overflow-hidden flex flex-col">
          <div className="bg-blue-700 text-white px-3 py-2 flex justify-between items-start flex-shrink-0">
            <div>
              <p className="text-sm font-semibold">🛠️ Office User's Progress</p>
              <p className="text-xs text-blue-200 mt-0.5">
                {triedCount} of {totalCount} steps tried
                {stepsUpdatedAt && <span className="ml-1">· last updated {new Date(stepsUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              </p>
            </div>
            <button onClick={() => setShowPopover(false)} className="text-white hover:text-gray-200 text-lg leading-none ml-2">×</button>
          </div>

          <div className="px-3 pt-2 pb-1 flex-shrink-0">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${totalCount > 0 ? (triedCount / totalCount) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="overflow-y-auto flex-1 p-3 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-sm text-gray-500">Loading...</span>
              </div>
            ) : (
              steps.map((step, index) => {
                const tried = completedSteps.includes(index);
                return (
                  <div key={index} className={`flex items-start gap-2 p-2 rounded text-sm ${tried ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs ${tried ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'}`}>
                      {tried ? '✓' : ''}
                    </div>
                    <div className="flex-1">
                      <span className="text-xs text-gray-400 font-semibold uppercase mr-1">Step {index + 1}</span>
                      <span className={tried ? 'text-gray-400 line-through' : 'text-gray-700'}>{step}</span>
                    </div>
                    {tried && <span className="flex-shrink-0 text-xs text-green-600 font-medium">Tried</span>}
                  </div>
                );
              })
            )}
            {allDone && (
              <div className="p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800 mt-2">
                ✅ Office user has tried all steps. If the issue persists, please attend in person.
              </div>
            )}
            {triedCount === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">The office user has not ticked any steps yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
