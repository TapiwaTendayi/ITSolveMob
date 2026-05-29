// frontend/src/components/TroubleshootingSteps.jsx
import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

export default function TroubleshootingSteps({ steps, isLoading, requestId }) {
  const [completedSteps, setCompletedSteps] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const [thinkingDots, setThinkingDots] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading) {
      const interval = setInterval(() => {
        setThinkingDots(prev => (prev.length >= 3 ? '' : prev + '.'));
      }, 500);
      return () => clearInterval(interval);
    } else {
      setThinkingDots('');
    }
  }, [isLoading]);

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

  const toggleStep = (stepIndex) => {
    const newCompleted = completedSteps.includes(stepIndex)
      ? completedSteps.filter(i => i !== stepIndex)
      : [...completedSteps, stepIndex];
    setCompletedSteps(newCompleted);
    saveProgress(newCompleted);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="bg-blue-700 text-white p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
            <div>
              <h2 className="text-lg font-semibold">System Administration</h2>
              <p className="text-sm text-blue-100 mt-1">Preparing guidance for your issue{thinkingDots}</p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                style={{ animationDelay: `${i * 0.15}s` }}>
                <div className="w-6 h-6 rounded-full bg-gray-200 flex-shrink-0"></div>
                <div className="flex-1 h-4 bg-gray-200 rounded" style={{ width: `${75 + (i % 3) * 10}%` }}></div>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-6">Please hold on while we prepare your next steps{thinkingDots}</p>
        </div>
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center">
        <div className="text-yellow-500 text-4xl mb-3">⚠️</div>
        <h3 className="text-lg font-semibold text-gray-800">Guidance Not Available at This Time</h3>
        <p className="text-gray-600 mt-2">A technician from System Administration will be in contact with you shortly.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="bg-blue-700 text-white p-4 cursor-pointer flex justify-between items-center"
        onClick={() => setExpanded(!expanded)}>
        <div>
          <h2 className="text-lg font-semibold">🛠️ Guidance from System Administration</h2>
          <p className="text-sm text-blue-100 mt-1">
            While you wait for a technician, please try the following steps
            {saving && <span className="ml-2 text-blue-200 text-xs animate-pulse">• saving...</span>}
          </p>
        </div>
        <button className="text-white text-xl transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</button>
      </div>

      {expanded && (
        <div className="p-6">
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800 text-sm">
              📋 System Administration has reviewed your request and suggests you try the steps below while a technician is being dispatched. Please tick each step as you try it — the technician will see your progress.
            </p>
          </div>
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index}
                onClick={() => toggleStep(index)}
                className={`flex items-start gap-3 p-3 rounded-lg transition cursor-pointer ${
                  completedSteps.includes(index)
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-gray-50 border border-gray-200 hover:border-blue-300'
                }`}>
                <button className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5 transition ${
                  completedSteps.includes(index)
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-400 hover:border-blue-500 hover:bg-blue-50'
                }`}>
                  {completedSteps.includes(index) && '✓'}
                </button>
                <div className="flex-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase mr-2">Step {index + 1}</span>
                  <p className={`text-gray-800 mt-0.5 ${completedSteps.includes(index) ? 'line-through text-gray-400' : ''}`}>{step}</p>
                </div>
              </div>
            ))}
          </div>
          {completedSteps.length === steps.length && steps.length > 0 && (
            <div className="mt-6 p-4 bg-green-100 border border-green-300 rounded-lg flex items-center gap-3">
              <span className="text-green-600 text-2xl">🎉</span>
              <div>
                <p className="font-semibold text-green-800">Well done — you have completed all steps!</p>
                <p className="text-sm text-green-700 mt-1">If the issue is still present, please remain at your workstation. A technician will be with you shortly.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
