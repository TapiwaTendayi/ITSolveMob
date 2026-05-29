// frontend/src/pages/SupervisorDashboard.jsx
import { useEffect, useState, useRef } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import generateReport from "../utils/reportGenerator";
import { useNavigate } from "react-router-dom";
import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { NotificationContext } from '../context/NotificationContext';
import { connectSocket, disconnectSocket, getSocket } from '../utils/socket';
import Notifications from '../components/Notifications';
import NotificationPermissionButton from '../components/NotificationPermissionButton';
import ChatWindow from "../components/ChatWindow";
import RequestTroubleshooting from '../components/RequestTroubleshooting';

export default function SupervisorDashboard() {
  const { logout, token, user } = useContext(AuthContext);
  const { addNotification } = useContext(NotificationContext);

  const addNotificationRef = useRef(addNotification);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  const [allRequests, setAllRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [displayedRequests, setDisplayedRequests] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    status: "all",
    month: "",
    year: "",
    office: "",
    assignedTo: "",
  });
  const [showTroubleshootingModal, setShowTroubleshootingModal] = useState(false);
  const [selectedTroubleshooting, setSelectedTroubleshooting] = useState('');
  const [selectedChat, setSelectedChat] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [responseText, setResponseText] = useState({});
  const [sendingResponse, setSendingResponse] = useState({});

  // Derived list of unique offices from all requests
  const [officeOptions, setOfficeOptions] = useState([]);

  const socketRef = useRef(null);
  const navigate = useNavigate();

  const fetchUnreadCounts = async () => {
    try {
      const res = await api.get("/messages/unread/counts");
      setUnreadCounts(res.data);
    } catch (err) {
      console.error("Failed to fetch unread counts:", err);
    }
  };

  const openChat = async (requestId, title) => {
    setSelectedChat({ requestId, title });
    try {
      await api.post(`/messages/mark-read/${requestId}`);
      fetchUnreadCounts();
    } catch (err) {
      console.error("Failed to mark messages as read:", err);
    }
  };

  useEffect(() => {
    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?._id) return;

    socketRef.current = connectSocket(user._id, user.role);
    const socket = socketRef.current;

    const notify = (msg, type) => {
      addNotificationRef.current?.(msg, type);
    };

    socket.on("new-request", (data) => {
      notify(data.message, 'info');
      if (data.request) {
        setAllRequests(prev => [data.request, ...prev]);
      } else {
        fetchData();
      }
    });

    socket.on("office-waiting", (data) => {
      notify(`⏰ ${data.message}`, 'warning');
    });

    socket.on("stored-notifications", (notifications) => {
      // Notification bell only for stored/offline items — single consolidated toast
      notifications.forEach(n => {
        notify(n.message, n.type);
        api.post('/notifications/mark-read', { ids: [n._id] }).catch(console.error);
      });
      if (notifications.length > 0) {
        toast(`📬 You have ${notifications.length} pending notification${notifications.length > 1 ? 's' : ''}`, {
          duration: 4000, icon: '🔔',
        });
      }
    });

    socket.on("new-message", () => {
      fetchUnreadCounts();
    });

    socket.on("request-resolved", (data) => {
      // Toast only — avoid crowding UI with both toast and notification bell
      toast.success(data.message, { duration: 4000, icon: '✅' });
      setAllRequests(prev =>
        prev.map(request =>
          request._id === data.requestId
            ? { ...request, status: "resolved", resolvedAt: data.resolvedAt || new Date() }
            : request
        )
      );
    });

    socket.on("request-updated", () => {
      fetchData();
    });

    return () => {
      socket.off("new-request");
      socket.off("stored-notifications");
      socket.off("office-waiting");
      socket.off("new-message");
      socket.off("request-resolved");
      socket.off("request-updated");
    };
  }, [user]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

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

  const fetchData = async () => {
    try {
      const [reqRes, userRes] = await Promise.all([
        api.get("/requests"),
        api.get("/users"),
      ]);
      setAllRequests(reqRes.data);
      setFilteredRequests(reqRes.data);

      // Build unique office list from requests (live populate OR snapshot)
      const offices = [
        ...new Set(
          reqRes.data
            .map(r => r.requestedBy?.office || r.requestedBy?.name
                   || r.requestedBySnapshot?.office || r.requestedBySnapshot?.name)
            .filter(Boolean)
        ),
      ].sort();
      setOfficeOptions(offices);

      const allAssignees = userRes.data.filter(
        u => u.role === 'student' || u.role === 'supervisor'
      );
      setAssignees(allAssignees);
    } catch (err) {
      console.error("Fetch error:", err.response?.data || err.message);
      toast.error("Failed to load dashboard");
      navigate("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return navigate("/login");
    fetchData();
  }, []);

  // Apply all filters
  useEffect(() => {
    let filtered = [...allRequests];

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
    // Filter by office
    if (reportFilters.office) {
      filtered = filtered.filter(req => {
        const office = req.requestedBy?.office || req.requestedBy?.name
                    || req.requestedBySnapshot?.office || req.requestedBySnapshot?.name || "";
        return office === reportFilters.office;
      });
    }
    // Filter by assigned technician
    if (reportFilters.assignedTo) {
      if (reportFilters.assignedTo === "__unassigned__") {
        filtered = filtered.filter(req => !req.assignedTo && !req.assignedToSnapshot?.name);
      } else {
        filtered = filtered.filter(
          req => req.assignedTo?._id === reportFilters.assignedTo
        );
      }
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
    setDisplayedRequests(filteredRequests.slice(startIndex, endIndex));
  }, [filteredRequests, currentPage, itemsPerPage]);

  const assignTask = async (requestId, studentId) => {
    try {
      const res = await api.post("/requests/assign", { requestId, studentId });
      toast.success(res.data.message || "Technician assigned successfully");
      fetchData();
    } catch (err) {
      console.error("Assign error:", err.response?.data || err.message);
      toast.error("Failed to assign technician");
    }
  };

  const sendResponse = async (requestId, responseMessage) => {
    if (!responseMessage.trim()) {
      toast.error("Please enter a response");
      return;
    }
    setSendingResponse(prev => ({ ...prev, [requestId]: true }));
    try {
      await api.post(`/requests/respond/${requestId}`, { response: responseMessage });
      toast.success("Message sent to office user successfully");
      setResponseText(prev => ({ ...prev, [requestId]: "" }));
      fetchData();
    } catch (err) {
      console.error("Response error:", err.response?.data || err.message);
      toast.error("Failed to send response");
    } finally {
      setSendingResponse(prev => ({ ...prev, [requestId]: false }));
    }
  };

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate("/login");
  };

  const viewTroubleshooting = (log) => {
    setSelectedTroubleshooting(log);
    setShowTroubleshootingModal(true);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    setReportFilters({ status: "all", month: "", year: "", office: "", assignedTo: "" });
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
    </div>
  );

  return (
    <div className="p-3 md:p-6 min-h-screen bg-gray-50">
      <Notifications />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 md:mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-bold">System Administration 🛡️</h1>
          <p className="text-gray-600 text-xs md:text-sm mt-1">Welcome, {user?.name || "System Administrator"}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm"
          >
            {showFilters ? "Hide Filters" : "Filters"}
          </button>
          <button
            onClick={() => {
              const opts = {};
              if (reportFilters.assignedTo && reportFilters.assignedTo !== '__unassigned__') {
                const found = assignees.find(a => a._id === reportFilters.assignedTo);
                if (found) opts.assignedToName = found.name;
              }
              const ok = generateReport(filteredRequests, "supervisor", reportFilters, true, allRequests.length, opts); if (!ok) toast.error("No records match the current filters.");
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

      {/* Manage Users button */}
      <div className="flex gap-2 mb-4 md:mb-6">
        <button
          onClick={() => navigate("/supervisor/users")}
          className="bg-green-600 text-white px-3 py-1.5 rounded text-sm"
        >
          👥 Manage Users
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="mb-4 md:mb-6 bg-white p-3 md:p-4 rounded-lg shadow-md">
          <h2 className="font-semibold text-base md:text-lg mb-3">Filter Requests</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">

            {/* Status */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Status</label>
              <select name="status" value={reportFilters.status} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Month</label>
              <select name="month" value={reportFilters.month} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                {months.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Year */}
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

            {/* Office filter — NEW */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Office</label>
              <select name="office" value={reportFilters.office} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="">All Offices</option>
                {officeOptions.map(office => (
                  <option key={office} value={office}>{office}</option>
                ))}
              </select>
            </div>

            {/* Assigned To filter — NEW */}
            <div>
              <label className="block text-xs md:text-sm font-medium mb-1">Assigned To</label>
              <select name="assignedTo" value={reportFilters.assignedTo} onChange={handleFilterChange}
                className="border p-1.5 rounded w-full text-sm">
                <option value="">All</option>
                <option value="__unassigned__">— Unassigned —</option>
                {assignees.map(a => (
                  <option key={a._id} value={a._id}>
                    {a.name}{a._id === user?._id ? ' (You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset */}
            <div className="flex items-end">
              <button onClick={resetFilters}
                className="bg-gray-500 text-white px-3 py-1.5 rounded w-full text-sm">
                Reset
              </button>
            </div>
          </div>
          <p className="text-xs md:text-sm text-gray-600 mt-3">
            Showing <strong>{filteredRequests.length}</strong> request{filteredRequests.length !== 1 ? 's' : ''} &nbsp;|&nbsp; Page {currentPage} of {totalPages}
          </p>
        </div>
      )}

      {/* Items per page + count */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 bg-white p-3 rounded-lg shadow">
        <div>
          <h2 className="text-base md:text-lg font-semibold">All Requests</h2>
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
      <div className="overflow-x-auto shadow-lg rounded-2xl bg-white mb-4">
        <table className="w-full min-w-[900px] border-collapse text-xs md:text-sm">
          <thead>
            <tr className="bg-gray-200">
              <th className="p-2 border">Description</th>
              <th className="p-2 border">Office</th>
              <th className="p-2 border">Assigned</th>
              <th className="p-2 border">Assign</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border hidden md:table-cell">Created</th>
              <th className="p-2 border hidden md:table-cell">Resolved</th>
              <th className="p-2 border">Admin Response</th>
              <th className="p-2 border">Chat</th>
              <th className="p-2 border">Steps</th>
            </tr>
          </thead>
          <tbody>
            {displayedRequests.length ? (
              displayedRequests.map((r) => (
                <tr key={r._id} className="border-t hover:bg-gray-50">
                  <td className="p-2 border max-w-[200px]">
                    <span className="block whitespace-normal break-words text-sm leading-snug" title={r.description}>
                      {r.description}
                    </span>
                  </td>
                  <td className="p-2 border text-xs">
                    {(() => {
                      const label = r.requestedBy?.office || r.requestedBy?.name
                                 || r.requestedBySnapshot?.office || r.requestedBySnapshot?.name;
                      const isDeleted = r.requestedBy?.isDeleted;
                      return (
                        <span className="flex flex-col gap-0.5">
                          <span>{label || "N/A"}</span>
                          {isDeleted && <span className="text-[10px] text-gray-400 italic">inactive account</span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="p-2 border">
                    {(() => {
                      const name = r.assignedTo?.name || r.assignedToSnapshot?.name;
                      const isDeleted = r.assignedTo?.isDeleted;
                      if (!name) return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-800">—</span>;
                      return (
                        <span className="flex flex-col gap-0.5">
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium">{name}</span>
                          {isDeleted && <span className="text-[10px] text-gray-400 italic px-1">inactive account</span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="p-2 border">
                    <select
                      defaultValue=""
                      onChange={(e) => e.target.value && assignTask(r._id, e.target.value)}
                      className="border p-1 rounded text-xs w-full min-w-[80px]"
                      disabled={r.status === "resolved"}
                    >
                      <option value="">Select</option>
                      {assignees.filter(a => a.role === 'student').length > 0 && (
                        <optgroup label="Students">
                          {assignees.filter(a => a.role === 'student').map(s => (
                            <option key={s._id} value={s._id}>{s.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {assignees.filter(a => a.role === 'supervisor').length > 0 && (
                        <optgroup label="System Administration">
                          {assignees.filter(a => a.role === 'supervisor').map(s => (
                            <option key={s._id} value={s._id}>
                              {s.name} {s._id === user?._id ? '(You)' : ''}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </td>
                  <td className="p-2 border text-center">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                      r.status === "resolved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {r.status === "resolved" ? "✅" : "❌"}
                    </span>
                  </td>
                  <td className="p-2 border hidden md:table-cell text-xs">
                    {new Date(r.createdAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="p-2 border hidden md:table-cell text-xs">
                    {r.resolvedAt ? new Date(r.resolvedAt).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="p-2 border">
                    <div className="flex flex-col gap-1">
                      {r.supervisorResponse && (
                        <div className="bg-green-50 p-1 rounded text-xs max-w-[160px] whitespace-normal break-words" title={r.supervisorResponse}>
                          <p className="text-gray-700">{r.supervisorResponse}</p>
                        </div>
                      )}
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={responseText[r._id] || ""}
                          onChange={(e) => setResponseText(prev => ({ ...prev, [r._id]: e.target.value }))}
                          placeholder="Reply..."
                          className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs min-w-[60px]"
                          disabled={sendingResponse[r._id]}
                        />
                        <button
                          onClick={() => sendResponse(r._id, responseText[r._id] || "")}
                          disabled={sendingResponse[r._id] || !(responseText[r._id]?.trim())}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs disabled:bg-gray-400"
                        >
                          {sendingResponse[r._id] ? "..." : "Send"}
                        </button>
                      </div>
                    </div>
                  </td>
                  <td className="p-2 border text-center">
                    <button
                      onClick={() => openChat(r._id, r.description)}
                      className="relative bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                    >
                      💬
                      {unreadCounts[r._id] > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                          {unreadCounts[r._id] > 9 ? '9+' : unreadCounts[r._id]}
                        </span>
                      )}
                    </button>
                  </td>
                  <td className="p-2 border">
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
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10" className="p-4 text-center text-gray-500 text-xs md:text-sm">
                  No requests found with current filters
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

      {/* Modals */}
      {showTroubleshootingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
          <div className="bg-white rounded-lg p-4 md:p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <h3 className="text-lg font-bold mb-4">Troubleshooting Log</h3>
            <pre className="whitespace-pre-wrap text-xs md:text-sm">{selectedTroubleshooting}</pre>
            <button onClick={() => setShowTroubleshootingModal(false)} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded">
              Close
            </button>
          </div>
        </div>
      )}

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
