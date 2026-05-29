// frontend/src/components/OfficeStepsViewer.jsx
import { useState, useCallback } from 'react';
import api from '../utils/api';

export default function OfficeStepsViewer({ requestId, steps, initialCompleted = [], onClose }) {
  const [completedSteps, setCompletedSteps] = useState(initialCompleted);
  const [saving, setSaving] = useState(false);

  const saveProgress = useCallback(async (newCompleted) => {
    if (!requestId) return;
    setSaving(true);
    try {
      await api.patch(`/requests/${requestId}/step-progress`, { completedSteps: newCompleted });
    } catch (err) {
      console.error('Failed to save step progress:', err);
    } finally {
      setSaving(false);
    }
  }, [requestId]);

  const toggleStep = (index) => {
    const newCompleted = completedSteps.includes(index)
      ? completedSteps.filter(i => i !== index)
      : [...completedSteps, index];
    setCompletedSteps(newCompleted);
    saveProgress(newCompleted);
  };

  const triedCount = completedSteps.length;
  const allDone = triedCount === steps.length;

  return (
    <div>
      <div className="bg-blue-700 text-white p-4 rounded-t-lg flex justify-between items-start">
        <div>
          <h2 className="text-lg font-semibold">🛠️ Troubleshooting Steps</h2>
          <p className="text-sm text-blue-100 mt-1">
            Tick each step as you try it — your technician can see your progress in real time.
            {saving && <span className="ml-2 text-blue-200 text-xs animate-pulse">saving...</span>}
          </p>
        </div>
        <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl leading-none ml-4">×</button>
      </div>

      <div className="px-4 pt-3 pb-1 bg-white">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{triedCount} of {steps.length} steps tried</span>
          {allDone && <span className="text-green-600 font-semibold">All done!</span>}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${steps.length > 0 ? (triedCount / steps.length) * 100 : 0}%` }} />
        </div>
      </div>

      <div className="mx-4 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-800 text-sm">📋 System Administration has reviewed your request and suggests you try these steps while a technician is being dispatched.</p>
      </div>

      <div className="p-4 space-y-3">
        {steps.map((step, index) => {
          const tried = completedSteps.includes(index);
          return (
            <div key={index} onClick={() => toggleStep(index)}
              className={`flex items-start gap-3 p-3 rounded-lg transition cursor-pointer select-none ${
                tried ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
              }`}>
              <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition ${
                tried ? 'bg-green-500 border-green-500 text-white' : 'border-gray-400 hover:border-blue-500'
              }`}>
                {tried && '✓'}
              </div>
              <div className="flex-1">
                <span className="text-xs font-semibold text-gray-400 uppercase mr-2">Step {index + 1}</span>
                <p className={`text-gray-800 mt-0.5 ${tried ? 'line-through text-gray-400' : ''}`}>{step}</p>
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="mx-4 mb-4 p-4 bg-green-100 border border-green-300 rounded-lg flex items-center gap-3">
          <span className="text-2xl">🎉</span>
          <div>
            <p className="font-semibold text-green-800">You have completed all steps!</p>
            <p className="text-sm text-green-700 mt-1">If the issue is still present, please remain at your workstation. A technician will be with you shortly.</p>
          </div>
        </div>
      )}

      <div className="px-4 pb-4">
        <button onClick={onClose} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 rounded-lg text-sm font-medium transition">Close</button>
      </div>
    </div>
  );
}
