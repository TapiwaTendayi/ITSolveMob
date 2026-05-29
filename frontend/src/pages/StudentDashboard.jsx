// frontend/src/pages/StudentDashboard.jsx
import { useState, useEffect, useContext, useRef } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import generateReport from "../utils/reportGenerator";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { connectSocket, disconnectSocket } from '../utils/socket';
import { NotificationContext } from '../context/NotificationContext';
import Notifications from '../components/Notifications';
import NotificationPermissionButton from '../components/NotificationPermissionButton';
import RequestTroubleshooting from '../components/RequestTroubleshooting';

export default function StudentDashboard() {
  const { logout, token, user } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);

  const addNotificationRef = useRef(addNotification);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [displayedRequests, setDisplayedRequests] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [myTasksOnly, setMyTasksOnly] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    status: "all",
    month: "",
    year: "",
  });
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false);
  const [selectedTroubleshooting, setSelectedTroubleshooting] = useState('');

  const socketRef = useRef(null);
  const processedIds = useRef(new Set());

  const updateRequestInState = (updatedRequest) => {
    setAllRequests(prevRequests => {
      const exists = prevRequests.some(r => r._id === updatedRequest._id);
      if (exists) {
        return prevRequests.map(r =>
          r._id === updatedRequest._id ? { ...r, ...updatedRequest } : r
        );
      } else {
        return [updatedRequest, ...prevRequests];
      }
    });
  };

  useEffect(() => {
    if (!user?._id) return;

    socketRef.current = connectSocket(user._id, user.role);
    const socket = socketRef.current;

    const notify = (msg, type) => {
      addNotificationRef.current?.(msg, type);
    };

    socket.on("registered", (data) => {
      console.log("✅ Student registered with socket:", data);
    });

    socket.on("new-request", (data) => {
      console.log("📨 NEW REQUEST RECEIVED in student dashboard:", data);
      notify(data.message, 'info');
      toast(`📋 New Request: ${data.requestTitle || data.message}`, {
        duration: 5000,
        icon: '📋',
      });
      if (data.request) {
        updateRequestInState(data.request);
      } else {
        fetchRequests();
      }
    });

    socket.on("request-resolved", (data) => {
      console.log("✅ REQUEST RESOLVED in student dashboard:", data);
      // Toast only — no notification bell for resolved requests
      toast.success(data.message, { duration: 4000, icon: '✅' });
      setAllRequests(prev =>
        prev.map(r =>
          r._id === data.requestId
            ? { ...r, status: "resolved", resolvedAt: data.resolvedAt || new Date() }
            : r
        )
      );
    });

    socket.on("task-assigned", (data) => {
      console.log("🎯 TASK ASSIGNMENT:", data);
      // Show both notification bell AND toast so the student is clearly alerted
      notify(data.message, 'success');
      toast.success(data.message, { duration: 5000, icon: '🎯' });
      fetchRequests();
    });

    socket.on("assigned-request", (data) => {
      console.log("📨 ASSIGNED REQUEST:", data);
      // Notification bell only — toast already shown via task-assigned event
      notify(data.message, 'success');
      fetchRequests();
    });

    socket.on("request-updated", () => {
      console.log("🔄 Request updated, refreshing...");
      fetchRequests();
    });

    socket.on("stored-notifications", (notifications) => {
      const fresh = notifications.filter(n => !processedIds.current.has(n._id));
      fresh.forEach(n => {
        processedIds.current.add(n._id);
        notify(n.message, n.type);
        api.post('/notifications/mark-read', { ids: [n._id] }).catch(console.error);
      });
      // Show one consolidated toast instead of spamming the UI
      if (fresh.length > 0) {
        toast(`📬 You have ${fresh.length} pending notification${fresh.length > 1 ? 's' : ''}`, {
          duration: 4000, icon: '🔔',
        });
      }
    });

    socket.on("connect_error", (err) => {
      console.log("❌ Student socket error:", err.message);
    });

    return () => {
      console.log("🧹 Cleaning up student socket listeners");
      socket.off("registered");
      socket.off("new-request");
      socket.off("request-resolved");
      socket.off("task-assigned");
      socket.off("assigned-request");
      socket.off("request-updated");
      socket.off("stored-notifications");
      socket.off("connect_error");
    };
  }, [user]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const navigate = useNavigate();

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  const months = [
    { value: "", label: "All Months" },
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const [selfAssigning, setSelfAssigning] = useState({});
  const [showSupervisorAbsent, setShowSupervisorAbsent] = useState(false);

  const handleSelfAssign = async (requestId, requestTitle) => {
    if (!window.confirm(`Take on this task?\n\n"${requestTitle}"\n\nThis will assign it to you and notify System Administration.`)) return;
    setSelfAssigning(prev => ({ ...prev, [requestId]: true }));
    try {
      await api.post('/requests/self-assign', { requestId });
      toast.success('✅ Task assigned to you! System Administration has been notified.');
      fetchRequests();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to self-assign request';
      toast.error(msg);
    } finally {
      setSelfAssigning(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await api.get("/requests");
      setAllRequests(res.data);
    } catch (err) {
      console.error(err);
      toast.error("Error fetching requests");
    }
  };

  useEffect(() => {
    if (!token) return navigate("/login");
    fetchRequests();
  }, []);

  // Apply all filters including My Tasks toggle
  useEffect(() => {
    let filtered = [...allRequests];

    // My Tasks toggle — show only tasks assigned to the logged-in user
    if (myTasksOnly && user?._id) {
      filtered = filtered.filter(req => req.assignedTo?._id === user._id);
    }

    if (reportFilters.status && reportFilters.status !== "all") {
      filtered = filtered.filter(req => req.status === reportFilters.status);
    }
    if (reportFilters.month) {
      filtered = filtered.filter(req => {
        const reqMonth = new Date(req.createdAt).getMonth() + 1;
        return reqMonth === parseInt(reportFilters.month);
      });
    }
    if (reportFilters.year) {
      filtered = filtered.filter(req => {
        const reqYear = new Date(req.createdAt).getFullYear();
        return reqYear === parseInt(reportFilters.year);
      });
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setFilteredRequests(filtered);
    setCurrentPage(1);
  }, [allRequests, reportFilters, myTasksOnly, user]);

  useEffect(() => {
    const total = Math.ceil(filteredRequests.length / itemsPerPage);
    setTotalPages(total || 1);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    setDisplayedRequests(filteredRequests.slice(startIndex, endIndex));
  }, [filteredRequests, currentPage, itemsPerPage]);

  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    disconnectSocket();
    logout();
    navigate("/login");
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setReportFilters({ status: "all", month: "", year: "" });
    setMyTasksOnly(false);
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const viewTroubleshooting = (log) => {
    setSelectedTroubleshooting(log);
    setShowTroubleshootingModal(true);
  };

  // Count only PENDING tasks assigned to the logged-in user
  const myTaskCount = allRequests.filter(
    r => r.assignedTo?._id === user?._id && r.status !== "resolved"
  ).length;

  return (
    <div className="p-3 md:p-6">
      <Notifications />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Student Dashboard 🎓</h1>
          <p className="text-gray-600 text-xs md:text-sm mt-1">Welcome, {user?.name || "Student"}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* My Tasks button */}
          <button
            onClick={() => setMyTasksOnly(prev => !prev)}
            className={`relative px-3 py-1.5 rounded text-sm font-medium transition ${
              myTasksOnly
                ? "bg-green-600 text-white shadow-inner"
                : "bg-green-100 text-green-800 hover:bg-green-200"
            }`}
          >
            🎯 My Tasks
            {myTaskCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {myTaskCount > 9 ? "9+" : myTaskCount}
              </span>
            )}
          </button>

          {/* Supervisor Absent button */}
          <button
            onClick={() => setShowSupervisorAbsent(prev => !prev)}
            className={`relative px-3 py-1.5 rounded text-sm font-medium transition ${
              showSupervisorAbsent
                ? "bg-orange-600 text-white shadow-inner"
                : "bg-orange-100 text-orange-800 hover:bg-orange-200"
            }`}
          >
            🔴 Admin Absent / Busy
          </button>
          <button
  onClick={() => {
    const ok = generateReport(
      filteredRequests,
      "student",
      reportFilters,
      true,
      allRequests.length,
      { myTasksOnly, myTasksLabel: user?.name }
    );
    if (!ok) {
      toast.error("No records match the current filters.");
    }
  }}
  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
>
  📄 Report
</button>
          <button onClick={handleLogout} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm">
            🚪 Logout
          </button>
          <NotificationPermissionButton />
        </div>
      </div>

      {/* My Tasks active banner */}
      {myTasksOnly && (
        <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <span className="text-green-700 text-sm font-medium">
            🎯 Showing only tasks assigned to you ({myTaskCount})
          </span>
          <button
            onClick={() => setMyTasksOnly(false)}
            className="ml-auto text-xs text-green-600 hover:text-green-800 underline"
          >
            Show all
          </button>
        </div>
      )}

      {/* Supervisor Absent panel */}
      {showSupervisorAbsent && (
        <div className="mb-3 bg-orange-50 border border-orange-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔴</span>
            <div className="flex-1">
              <h3 className="font-semibold text-orange-900">System Administration Absent / Busy Mode</h3>
              <p className="text-sm text-orange-700 mt-1">
                System Administration is currently unavailable. You can self-assign any <strong>unassigned</strong> pending
                request below by clicking <strong>"Take Task"</strong>. This will assign it to you and notify
                System Administration immediately.
              </p>
            </div>
            <button onClick={() => setShowSupervisorAbsent(false)} className="text-orange-400 hover:text-orange-700 text-lg">✕</button>
          </div>
        </div>
      )}
      <p className="text-sm text-gray-600">
        View all requests. Only the office user who created a request can mark it as resolved.
      </p>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-4 md:mb-6 bg-white p-3 md:p-4 rounded-lg shadow-md">
          <h2 className="font-semibold text-base md:text-lg mb-3">Filter Tasks</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Status</label>
              <select name="status" value={reportFilters.status} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Month</label>
              <select name="month" value={reportFilters.month} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Year</label>
              <select name="year" value={reportFilters.year} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="">All Years</option>
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters}
                className="bg-gray-500 text-white px-3 py-1.5 rounded w-full text-sm">
                Reset All
              </button>
            </div>
          </div>
          <p className="text-xs md:text-sm text-gray-600 mt-2">
            Total: {filteredRequests.length} requests | Page {currentPage} of {totalPages}
          </p>
        </div>
      )}

      {/* Items per page */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 bg-white p-3 rounded-lg shadow">
        <div>
          <h2 className="text-base md:text-lg font-semibold">
            {myTasksOnly ? "My Tasks" : "All Requests"}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs md:text-sm text-gray-600">Show</span>
            <select value={itemsPerPage} onChange={handleItemsPerPageChange}
              className="border p-1 rounded text-xs md:text-sm">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <span className="text-xs md:text-sm text-gray-600">per page</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs md:text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
          <p className="text-xs text-gray-500">Showing {displayedRequests.length} of {filteredRequests.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-lg shadow mb-4">
        <table className="w-full min-w-[650px] text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 text-left">Description</th>
              <th className="p-2">Office</th>
              <th className="p-2">Assigned To</th>
              <th className="p-2">Status</th>
              <th className="p-2 hidden md:table-cell">Created</th>
              <th className="p-2 hidden md:table-cell">Resolved</th>
              <th className="p-2">Steps</th>
              {showSupervisorAbsent && <th className="p-2 text-orange-700">Take Task</th>}
            </tr>
          </thead>
          <tbody>
            {displayedRequests.map((r) => (
              <tr
                key={r._id}
                className={`border-t text-center hover:bg-gray-50 ${
                  r.assignedTo?._id === user?._id ? "bg-green-50" : ""
                }`}
              >
                <td className="p-2 text-left max-w-[200px]">
                    <span className="block whitespace-normal break-words text-sm leading-snug" title={r.description}>
                      {r.description}
                    </span>
                  </td>
                <td className="p-2 text-xs">{r.requestedBy?.office || r.requestedBy?.name || "—"}</td>
                <td className="p-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    r.assignedTo?._id === user?._id
                      ? "bg-green-100 text-green-800 font-semibold"
                      : r.assignedTo
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
                  }`}>
                    {r.assignedTo?._id === user?._id
                      ? `${r.assignedTo.name} (You)`
                      : r.assignedTo?.name || "Unassigned"}
                  </span>
                </td>
                <td className="p-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                    r.status === "resolved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>
                    {r.status === "resolved" ? "✅" : "❌"}
                  </span>
                </td>
                <td className="p-2 hidden md:table-cell text-xs">
                  {new Date(r.createdAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="p-2 hidden md:table-cell text-xs">
                  {r.resolvedAt
                    ? new Date(r.resolvedAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className="p-2">
                  <RequestTroubleshooting requestId={r._id} />
                  {r.troubleshooting && (
                    <button
                      onClick={() => viewTroubleshooting(r.troubleshooting)}
                      className="text-blue-600 hover:underline text-xs mt-1 block"
                    >
                      Old Log
                    </button>
                  )}
                </td>
                {showSupervisorAbsent && (
                  <td className="p-2">
                    {!r.assignedTo && r.status !== 'resolved' ? (
                      <button
                        onClick={() => handleSelfAssign(r._id, r.description)}
                        disabled={selfAssigning[r._id]}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-2 py-1 rounded text-xs font-medium disabled:bg-gray-300 whitespace-nowrap"
                      >
                        {selfAssigning[r._id] ? '...' : '🙋 Take Task'}
                      </button>
                    ) : r.assignedTo?._id === user?._id ? (
                      <span className="text-green-600 text-xs font-semibold">✅ Yours</span>
                    ) : r.assignedTo ? (
                      <span className="text-gray-400 text-xs">Taken</span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                )}
                    </tr>   
            ))}
            {displayedRequests.length === 0 && (
              <tr>
                <td colSpan={showSupervisorAbsent ? "8" : "7"} className="p-6 text-center text-gray-500">
                  {myTasksOnly
                    ? "No tasks are currently assigned to you."
                    : "No requests found with current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-center items-center gap-2 bg-white p-3 rounded-lg shadow-md text-xs md:text-sm">
          <button onClick={() => goToPage(1)} disabled={currentPage === 1}
            className={`px-2 py-1 rounded ${currentPage === 1 ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white"}`}>
            «
          </button>
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
            className={`px-2 py-1 rounded ${currentPage === 1 ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white"}`}>
            ‹
          </button>
          <span className="text-gray-600 px-2">{currentPage} / {totalPages}</span>
          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}
            className={`px-2 py-1 rounded ${currentPage === totalPages ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white"}`}>
            ›
          </button>
          <button onClick={() => goToPage(totalPages)} disabled={currentPage === totalPages}
            className={`px-2 py-1 rounded ${currentPage === totalPages ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white"}`}>
            »
          </button>
        </div>
      )}

      {/* Troubleshooting Modal */}
      {showTroubleshootingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg p-4 md:p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Troubleshooting Log</h3>
            <pre className="whitespace-pre-wrap text-xs md:text-sm">{selectedTroubleshooting}</pre>
            <button
              onClick={() => setShowTroubleshootingModal(false)}
              className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}





