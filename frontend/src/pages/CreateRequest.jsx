// frontend/src/pages/CreateRequest.jsx
import { useState, useContext, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { AuthContext } from "../context/AuthContext";
import { NotificationContext } from "../context/NotificationContext";
import { getSocket } from "../utils/socket";
import TroubleshootingSteps from "../components/TroubleshootingSteps";

export default function CreateRequest() {
  const { user } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);
  const navigate = useNavigate();

  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [troubleshootingSteps, setTroubleshootingSteps] = useState(null);
  const [submittedRequestId, setSubmittedRequestId] = useState(null);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [supervisorResponded, setSupervisorResponded] = useState(false);

  const hasFetchedRef = useRef(false);

  // Listen for supervisor response via socket
  useEffect(() => {
    if (!submittedRequestId) return;

    const socket = getSocket();
    if (!socket) return;

    const handleSupervisorResponse = (data) => {
      if (data.requestId === submittedRequestId) {
        setSupervisorResponded(true);
        addNotification(data.message, "success");
        toast.success("System Administration has responded to your request!");
      }
    };

    socket.on("supervisor-response", handleSupervisorResponse);
    return () => {
      socket.off("supervisor-response", handleSupervisorResponse);
    };
  }, [submittedRequestId, addNotification]);

  // Immediately fetch troubleshooting steps after submission
  const fetchTroubleshootingSteps = async (requestId, issue) => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    setIsLoadingSteps(true);
    setShowSteps(true);

    try {
      const aiResponse = await api.post("/ai/troubleshoot", {
        issue: issue,
        requestId: requestId,
      });

      // Brief pause so the loading animation is visible
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setTroubleshootingSteps(aiResponse.data.steps);
      setIsLoadingSteps(false);
    } catch (error) {
      console.error("Failed to get troubleshooting steps:", error);
      setTroubleshootingSteps([
        "Restart your computer and try again.",
        "Check that all cable connections are secure.",
        "Verify your internet connection by opening a website such as google.com.",
        "If the issue persists, a technician will be with you shortly.",
      ]);
      setIsLoadingSteps(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error("Please describe your issue");
      return;
    }

    setIsSubmitting(true);

    try {
      const requestData = {
        title: description.substring(0, 50),
        description: description,
        troubleshooting: "",
        category: "general",
      };

      const response = await api.post("/requests/create", requestData);
      const newRequest = response.data.request;
      setSubmittedRequestId(newRequest._id);

      toast.success("✅ Your request has been sent to System Administration!");
      setRequestSubmitted(true);

      // Immediately fetch steps — no timer
      fetchTroubleshootingSteps(newRequest._id, description);
    } catch (err) {
      const errorMessage =
        err.response?.data?.message || "Failed to submit request. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Request</h1>
          <p className="mt-2 text-gray-600">
            Describe your IT issue and System Administration will assist you.
          </p>
        </div>

        {!requestSubmitted ? (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe your issue *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Example: My VoIP phone is not working, no dial tone..."
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
                <p className="mt-2 text-sm text-gray-500">
                  Be as detailed as possible. This helps us understand your issue better.
                </p>
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition disabled:bg-gray-400"
                >
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard/office")}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-3 px-4 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Success confirmation */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
              <div className="text-green-600 text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-800">Request Sent Successfully!</h2>
              <p className="text-green-700 mt-2">
                Your request has been received by System Administration. Reference ID: #
                {submittedRequestId?.slice(-6)}
              </p>
              <p className="text-green-600 mt-1 text-sm">
                A technician will be assigned to assist you shortly.
              </p>
            </div>

            {/* System Administration responded notification */}
            {supervisorResponded && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                <div className="text-green-600 text-4xl mb-3">✅</div>
                <h3 className="text-xl font-semibold text-green-800 mb-2">
                  System Administration Has Responded!
                </h3>
                <p className="text-green-700 mb-3">
                  Please check your dashboard for their message.
                </p>
                <button
                  onClick={() => navigate("/dashboard/office")}
                  className="mt-2 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition"
                >
                  Go to Dashboard
                </button>
              </div>
            )}

            {/* Troubleshooting steps — presented as coming from System Administration */}
            {showSteps && (
              <>
                <TroubleshootingSteps
                  steps={troubleshootingSteps}
                  isLoading={isLoadingSteps}
                  requestId={submittedRequestId}
                />
                {!isLoadingSteps && (
                  <div className="text-center mt-6">
                    <button
                      onClick={() => navigate("/dashboard/office")}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
