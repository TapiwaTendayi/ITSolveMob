// frontend/src/pages/OfficeDashboard.jsx
import { useState, useEffect, useContext, useRef } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import generateReport from "../utils/reportGenerator";
import { useNavigate, Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { NotificationContext } from "../context/NotificationContext";
import { getSocket, connectSocket } from "../utils/socket";
import ChatWindow from "../components/ChatWindow";
import OfficeStepsViewer from "../components/OfficeStepsViewer";

export default function OfficeDashboard() {
  const { user, logout, token } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);

  const addNotificationRef = useRef(addNotification);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [displayedRequests, setDisplayedRequests] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    status: "all",
    month: "",
    year: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedChat, setSelectedChat] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  const [stepsModal, setStepsModal] = useState(null);

  const navigate = useNavigate();
  const socketRef = useRef(null);

  const fetchUnreadCounts = async () => {
    try {
      const res = await api.get("/messages/unread/counts");
      setUnreadCounts(res.data);
    } catch (err) {
      console.error("Failed to fetch unread counts:", err);
    }
  };

  useEffect(() => {
    if (user && user._id) {
      if (!socketRef.current) {
        socketRef.current = connectSocket(user._id, user.role);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = socketRef.current || getSocket();
    if (!socket) {
      console.log("⚠️ Socket not available for office dashboard yet");
      return;
    }

    const notify = (msg, type) => {
      addNotificationRef.current?.(msg, type);
    };

    const handleSupervisorResponse = (data) => {
      console.log("📨 System administrator response received in office dashboard:", data);
      notify(`📝 ${data.message}`, 'success');
      fetchRequests();
    };

    const handleNewMessage = () => {
      fetchUnreadCounts();
    };

    const handleRequestResolved = (data) => {
      console.log("✅ REQUEST RESOLVED in office dashboard:", data);
      // Toast only — no persistent notification badge for the office user who resolved their own request
      toast.success("✅ Your request has been marked as resolved. A technician will no longer be dispatched.", {
        duration: 5000,
      });
      fetchRequests();
    };

    const handleRequestUpdated = (data) => {
      console.log("🔄 Request updated:", data);
      fetchRequests();
    };

    // Fired when a supervisor assigns a student OR a student self-picks a task
    const handleTaskAttending = (data) => {
      console.log("🔧 Task attending notification for office:", data);
      // Show persistent notification bell + toast so the office user knows who is coming
      addNotificationRef.current?.(data.message, 'info');
      toast(data.message, { duration: 6000, icon: '🔧' });
      fetchRequests();
    };

    // Show any notifications saved while the office user was offline
    const handleStoredNotifications = (storedNotifs) => {
      if (!storedNotifs || storedNotifs.length === 0) return;
      storedNotifs.forEach(n => {
        addNotificationRef.current?.(n.message, n.type || 'info');
        api.post('/notifications/mark-read', { ids: [n._id] }).catch(console.error);
      });
      toast(`📬 You have ${storedNotifs.length} pending notification${storedNotifs.length > 1 ? 's' : ''}`, {
        duration: 4000, icon: '🔔',
      });
    };

    socket.on("supervisor-response", handleSupervisorResponse);
    socket.on("task-attending", handleTaskAttending);
    socket.on("stored-notifications", handleStoredNotifications);
    socket.on("new-message", handleNewMessage);
    socket.on("request-resolved-toast", handleRequestResolved);
    socket.on("request-updated", handleRequestUpdated);

    return () => {
      console.log("🧹 Cleaning up office socket listeners");
      socket.off("supervisor-response", handleSupervisorResponse);
      socket.off("task-attending", handleTaskAttending);
      socket.off("stored-notifications", handleStoredNotifications);
      socket.off("new-message", handleNewMessage);
      socket.off("request-resolved-toast", handleRequestResolved);
      socket.off("request-updated", handleRequestUpdated);
    };
  }, [user]);

  const openChat = async (requestId, title) => {
    setSelectedChat({ requestId, title });
    try {
      await api.post(`/messages/mark-read/${requestId}`);
      fetchUnreadCounts();
    } catch (err) {
      console.error("Failed to mark messages as read:", err);
    }
  };

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

  const fetchRequests = async () => {
    try {
      console.log("📡 Fetching requests for user:", user);
      const res = await api.get("/requests");
      console.log("📡 Total requests from API:", res.data.length);

      const userId = user?.id || user?._id;
      const myRequests = res.data.filter((r) => {
        if (!r.requestedBy) return false;
        const requestedById = r.requestedBy._id || r.requestedBy;
        return requestedById === userId;
      });

      console.log("📡 My requests after filtering:", myRequests.length);
      setAllRequests(myRequests);
      setFilteredRequests(myRequests);
    } catch (err) {
      console.error("Fetch error:", err);
      toast.error("Failed to load requests");
    }
  };

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    if (user && (user.id || user._id)) {
      fetchRequests();
    }
  }, [user, token]);

  useEffect(() => {
    let filtered = [...allRequests];

    if (reportFilters.status && reportFilters.status !== "all") {
      filtered = filtered.filter((req) => req.status === reportFilters.status);
    }
    if (reportFilters.month) {
      filtered = filtered.filter((req) => {
        const reqMonth = new Date(req.createdAt).getMonth() + 1;
        return reqMonth === parseInt(reportFilters.month);
      });
    }
    if (reportFilters.year) {
      filtered = filtered.filter((req) => {
        const reqYear = new Date(req.createdAt).getFullYear();
        return reqYear === parseInt(reportFilters.year);
      });
    }

    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setFilteredRequests(filtered);
    setCurrentPage(1);
  }, [allRequests, reportFilters]);

  useEffect(() => {
    const total = Math.ceil(filteredRequests.length / itemsPerPage);
    setTotalPages(total || 1);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsForPage = filteredRequests.slice(startIndex, endIndex);
    setDisplayedRequests(itemsForPage);
  }, [filteredRequests, currentPage, itemsPerPage]);

  const markResolved = async (requestId) => {
    const toastId = toast.loading("Marking as resolved...");
    try {
      await api.post("requests/resolve", { requestId });
      // Dismiss the loading toast — the socket "request-resolved-toast" event
      // will fire immediately and show the single success toast to the office user.
      toast.dismiss(toastId);
      fetchRequests();
    } catch (err) {
      console.error("Resolve error:", err.response?.data || err.message);
      toast.error(err.response?.data?.message || "Failed to mark as resolved", {
        id: toastId,
      });
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const resetFilters = () => {
    setReportFilters({
      status: "all",
      month: "",
      year: "",
    });
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  return (
    <div className="p-3 md:p-6 bg-gray-100 min-h-screen">
      {/* Header - responsive */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">🏢 Office Dashboard</h1>
          <p className="text-gray-600 text-xs md:text-sm mt-1">Welcome, {user?.name || "Office User"} — {user?.office || "Office"}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Link
            to="/create-request"
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm transition"
          >
            ➕ Create
          </Link>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm"
          >
            {showFilters ? "Hide" : "Filters"}
          </button>
                  <button
  onClick={() => {
    const ok = generateReport(
      filteredRequests,
      "office",
      reportFilters,
      true,
      allRequests.length
    );
    if (!ok) {
      toast.error("No records match the current filters.");
    }
  }}
  className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm"
>
  📄 Report
</button>

          <button
            onClick={handleLogout}
            className="bg-red-600 text-white px-3 py-1.5 rounded text-sm"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="mb-4 md:mb-8 bg-white p-3 md:p-4 rounded-lg shadow-md">
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
                {months.map((month) => (
                  <option key={month.value} value={month.value}>{month.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Year</label>
              <select name="year" value={reportFilters.year} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="">All Years</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters}
                className="bg-gray-500 text-white px-3 py-1.5 rounded w-full text-sm">
                Reset
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
          <h2 className="text-base md:text-xl font-bold">My Requests</h2>
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

      {/* Table - scrollable on mobile */}
      {displayedRequests.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-500">No requests found</p>
          <p className="text-gray-400 text-sm mt-2">Click "Create" to submit a new support request.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow-md mb-4">
          <table className="w-full min-w-[600px] text-xs md:text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="p-2 text-left">Description</th>
                <th className="p-2">Status</th>
                <th className="p-2 hidden md:table-cell">Created</th>
                <th className="p-2 hidden md:table-cell">Resolved</th>
                <th className="p-2 hidden md:table-cell">Admin Response</th>
                <th className="p-2">Steps</th>
                <th className="p-2">Chat</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayedRequests.map((r) => (
                <tr key={r._id} className="border-b hover:bg-gray-50">
                  <td className="p-2 max-w-[200px]">
                    <span className="block whitespace-normal break-words text-sm leading-snug" title={r.description}>
                      {r.description}
                    </span>
                  </td>
                  <td className="p-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      r.status === "resolved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {r.status === "resolved" ? "✅" : "❌"}
                    </span>
                  </td>
                  <td className="p-2 text-center hidden md:table-cell text-xs">
                    {new Date(r.createdAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-2 text-center hidden md:table-cell text-xs">
                    {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="p-2 hidden md:table-cell max-w-[150px]">
                    {r.supervisorResponse ? (
                      <div className="bg-blue-50 p-1.5 rounded text-xs">
                        <p className="text-gray-700 whitespace-normal break-words text-sm">{r.supervisorResponse}</p>
                      </div>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="p-2 text-center">
                    {r.troubleshootingSteps?.steps?.length > 0 ? (
                      <button
                        onClick={() => setStepsModal({ requestId: r._id, steps: r.troubleshootingSteps.steps, completedSteps: r.completedSteps || [] })}
                        className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                      >
                        🛠️ View
                      </button>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="p-2 text-center">
                    <button onClick={() => openChat(r._id, r.description)}
                      className="relative bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs">
                      💬
                      {unreadCounts[r._id] > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                          {unreadCounts[r._id] > 9 ? '9+' : unreadCounts[r._id]}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="p-2 text-center">
                    {r.status !== "resolved" && (
                      <button onClick={() => markResolved(r._id)}
                        className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 text-xs">
                        ✅
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination - compact on mobile */}
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

      {stepsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="w-full max-w-lg max-h-[90vh] overflow-auto bg-white rounded-lg shadow-xl">
            <OfficeStepsViewer
              requestId={stepsModal.requestId}
              steps={stepsModal.steps}
              initialCompleted={stepsModal.completedSteps}
              onClose={() => { setStepsModal(null); fetchRequests(); }}
            />
          </div>
        </div>
      )}

      {/* Chat Modal */}
      {selectedChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="w-full max-w-2xl max-h-[90vh]">
            <ChatWindow
              requestId={selectedChat.requestId}
              requestTitle={selectedChat.title}
              onClose={() => setSelectedChat(null)}
              onMessageRead={fetchUnreadCounts}
            />
          </div>
        </div>
      )}
    </div>
  );
}