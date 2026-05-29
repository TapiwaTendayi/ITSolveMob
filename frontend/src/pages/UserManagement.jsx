// frontend/src/pages/UserManagement.jsx
import { useEffect, useState } from "react";
import api from "../utils/api";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [displayedUsers, setDisplayedUsers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "office",
    office: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [editingUserId, setEditingUserId] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  // Validation functions
  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    const newErrors = {};

    // Name
    if (!form.name.trim()) {
      newErrors.name = "Name is required";
    }

    // Email
    if (!form.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!validateEmail(form.email)) {
      newErrors.email = "Invalid email format";
    }

    // Password (for new user or if changed in edit)
    const isNewUser = !editingUserId;
    const passwordEntered = form.password.trim() !== "";

    if (isNewUser) {
      if (!form.password) {
        newErrors.password = "Password is required";
      } else if (form.password.length < 6) {
        newErrors.password = "Password must be at least 6 characters";
      }
    } else if (passwordEntered && form.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    // Confirm password (only if password is entered or for new user)
    if ((isNewUser || passwordEntered) && form.password !== form.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    // Office field for non‑student roles
    if (form.role !== "student" && !form.office.trim()) {
      newErrors.office = "Office name is required for this role";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get("/auth/users");
      setUsers(res.data);
      setFilteredUsers(res.data); // Initially no filter
    } catch (err) {
      console.error("Fetch users error:", err);
      toast.error("Failed to load users");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Pagination logic
  useEffect(() => {
    const total = Math.ceil(filteredUsers.length / itemsPerPage);
    setTotalPages(total || 1);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const itemsForPage = filteredUsers.slice(startIndex, endIndex);
    setDisplayedUsers(itemsForPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  // Optional: simple search filter (you can expand later)
  const handleSearch = (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = users.filter(u => 
      u.name.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
    setFilteredUsers(filtered);
    setCurrentPage(1);
  };

  const startEditUser = (user) => {
    setEditingUserId(user._id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "office",
      office: user.office || "",
      password: "", // Leave password empty for editing
      confirmPassword: "",
    });
    setErrors({});
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    resetForm();
  };

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      role: "office",
      office: "",
      password: "",
      confirmPassword: "",
    });
    setErrors({});
    setEditingUserId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Check if email already exists (excluding current user if editing)
    const emailExists = filteredUsers.some(u => u.email === form.email && u._id !== editingUserId);
    if (emailExists) {
      setErrors(prev => ({ ...prev, email: "A user with this email already exists" }));
      return;
    }

    try {
      const toastId = toast.loading(
        editingUserId ? "Updating user..." : "Creating user..."
      );

      // Prepare data
      const userData = {
        name: form.name,
        email: form.email,
        role: form.role,
        office: form.role === "student" ? "" : form.office,
      };

      // Only include password if provided (for edit) or always for new user
      if (form.password && form.password.trim() !== "") {
        userData.password = form.password;
      }

      if (editingUserId) {
        // UPDATE existing user
        await api.put(`/auth/users/${editingUserId}`, userData);
        toast.success("User updated successfully", { id: toastId });
      } else {
        // CREATE new user
        if (!form.password) {
          toast.error("Password is required for new users", { id: toastId });
          return;
        }
        await api.post("/auth/register", userData);
        toast.success("User created successfully", { id: toastId });
      }

      fetchUsers();
      resetForm();
    } catch (err) {
      console.error("Submit error:", err.response?.data);
      toast.error(
        err.response?.data?.message ||
          (editingUserId ? "Error updating user" : "Error creating user"),
        { id: toastId }
      );
    }
  };

  const deleteUser = async (id) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const idToast = toast.loading("Deleting user...");
      await api.delete(`/auth/delete/${id}`);
      toast.dismiss(idToast);
      toast.success("User deleted");
      fetchUsers();
    } catch (err) {
      toast.dismiss();
      console.error("Delete error:", err.response?.data);
      toast.error("Failed to delete user");
    }
  };

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-xl font-bold mb-4">Manage Users</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Create/Edit User Form */}
        <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow w-full">
          <h2 className="font-bold text-lg mb-3">
            {editingUserId ? "✏️ Edit User" : "➕ Create New User"}
          </h2>

          {/* Name */}
          <input
            className={`border p-2 w-full mb-1 rounded ${
              errors.name ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onBlur={validateForm}
          />
          {errors.name && <p className="text-red-500 text-sm mb-2">{errors.name}</p>}

          {/* Email */}
          <input
            className={`border p-2 w-full mb-1 rounded ${
              errors.email ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            onBlur={validateForm}
          />
          {errors.email && <p className="text-red-500 text-sm mb-2">{errors.email}</p>}

          {/* Role */}
          <select
            className="border p-2 w-full mb-2 rounded"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="office">Office</option>
            <option value="student">Student</option>
            <option value="supervisor">System Administration</option>
          </select>

          {/* Office (conditionally shown) */}
          {(form.role === "office" || form.role === "supervisor") && (
            <>
              <input
                className={`border p-2 w-full mb-1 rounded ${
                  errors.office ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="Office name"
                value={form.office}
                onChange={(e) => setForm({ ...form, office: e.target.value })}
                onBlur={validateForm}
              />
              {errors.office && <p className="text-red-500 text-sm mb-2">{errors.office}</p>}
            </>
          )}

          {/* Password */}
          <input
            className={`border p-2 w-full mb-1 rounded ${
              errors.password ? "border-red-500" : "border-gray-300"
            }`}
            placeholder={editingUserId ? "New Password (optional)" : "Password"}
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            onBlur={validateForm}
          />
          {errors.password && <p className="text-red-500 text-sm mb-2">{errors.password}</p>}

          {/* Confirm Password */}
          <input
            className={`border p-2 w-full mb-1 rounded ${
              errors.confirmPassword ? "border-red-500" : "border-gray-300"
            }`}
            placeholder="Confirm Password"
            type={showPassword ? "text" : "password"}
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            onBlur={validateForm}
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-sm mb-2">{errors.confirmPassword}</p>
          )}

          {/* Show password checkbox */}
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
            />
            Show password
          </label>

          {/* Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              type="submit"
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              {editingUserId ? "Update User" : "Create User"}
            </button>
            {editingUserId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Cancel Edit
              </button>
            )}
            <button
              type="button"
              onClick={resetForm}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Clear Form
            </button>
            <button
              type="button"
              onClick={() => navigate("/dashboard/supervisor")}
              className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
            >
              Back
            </button>
          </div>
        </form>

        {/* Users List */}
        <div className="bg-white rounded shadow p-4">
          <h2 className="font-semibold mb-3">Existing Users</h2>
          
          {/* Search input (optional) */}
          <input
            type="text"
            placeholder="Search users by name, email, or role..."
            className="border p-2 rounded w-full mb-4"
            onChange={handleSearch}
          />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Role</th>
                  <th className="p-2 text-left">Office</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedUsers.length ? (
                  displayedUsers.map((u) => (
                    <tr key={u._id} className="border-t">
                      <td className="p-2">{u.name}</td>
                      <td className="p-2">{u.email}</td>
                      <td className="p-2">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            u.role === "supervisor"
                              ? "bg-purple-100 text-purple-800"
                              : u.role === "office"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-green-100 text-green-800"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-2">{u.office || "-"}</td>
                      <td className="p-2 flex gap-2">
                        <button
                          onClick={() => startEditUser(u)}
                          className="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => navigate(`/supervisor/password/${u._id}`)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                        >
                          🔑 Password
                        </button>
                        <button
                          onClick={() => deleteUser(u._id)}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="p-4 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 bg-white p-4 rounded-lg shadow-md mt-4">
              <button
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded ${
                  currentPage === 1 ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                « First
              </button>
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded ${
                  currentPage === 1 ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                ‹ Previous
              </button>

              <div className="flex gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-3 py-1 rounded ${
                        currentPage === pageNum
                          ? "bg-blue-800 text-white"
                          : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded ${
                  currentPage === totalPages ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Next ›
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded ${
                  currentPage === totalPages ? "bg-gray-200 text-gray-400" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Last »
              </button>

              <span className="text-gray-600 ml-4 flex items-center gap-2">
                <span>Go to:</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const page = parseInt(e.target.value);
                    if (page >= 1 && page <= totalPages) goToPage(page);
                  }}
                  className="border p-1 rounded w-16 text-center"
                />
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}