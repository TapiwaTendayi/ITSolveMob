// frontend/src/pages/ChangePassword.
// This page allows users to change their password. It includes form validation and error handling.
import { useState, useContext } from "react";
import api from "../utils/api";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AuthContext } from "../context/AuthContext";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ password: "", confirm: "" });

  const validateForm = () => {
    const newErrors = { password: "", confirm: "" };
    let isValid = true;

    if (!password) {
      newErrors.password = "Password is required";
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
      isValid = false;
    }

    if (password !== confirm) {
      newErrors.confirm = "Passwords do not match";
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const updatePassword = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!user) return toast.error("Not logged in");

    try {
      const t = toast.loading("Updating password...");
      await api.put(`/auth/password/${user._id}`, { newPassword: password });
      toast.dismiss(t);
      toast.success("Password updated successfully");
      navigate(-1); // go back to previous page
    } catch (err) {
      toast.dismiss();
      console.error("Password update error:", err.response?.data);
      toast.error("Failed to update password");
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto bg-gray-50 min-h-screen">
      <div className="bg-white p-6 rounded shadow">
        <h1 className="text-xl font-bold mb-4">Change Your Password</h1>
        <form onSubmit={updatePassword} className="space-y-3">
          <div>
            <label className="block mb-1 font-semibold">New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              className={`border p-2 w-full rounded ${
                errors.password ? "border-red-500" : "border-gray-300"
              }`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={validateForm}
            />
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password}</p>
            )}
          </div>
          <div>
            <label className="block mb-1 font-semibold">Confirm Password</label>
            <input
              type={showPassword ? "text" : "password"}
              className={`border p-2 w-full rounded ${
                errors.confirm ? "border-red-500" : "border-gray-300"
              }`}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={validateForm}
            />
            {errors.confirm && (
              <p className="text-red-500 text-sm mt-1">{errors.confirm}</p>
            )}
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={() => setShowPassword(!showPassword)}
            />
            Show password
          </label>
          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Update Password
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}