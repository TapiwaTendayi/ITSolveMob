// src/pages/Home.jsx
import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="min-h-screen  flex flex-col items-center justify-center px-6 py-10">
      {/* Main Card */}
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-lg p-10 flex flex-col md:flex-row items-center gap-10">
        {/* Left Side */}
        <div className="flex-1">
          {/* Logo */}
          <img
            src="/beitbridge-logo.png"
            alt="Municipality of Beitbridge"
            className="w-68 mb-6" 
          />

          <h1 className="text-4xl font-bold text-blue-700  mb-4">Systems Administration</h1>

          <p className="text-gray-600 text-lg leading-relaxed mb-6">
            A centralized platform for reporting and managing IT-related issues
            across the Municipality of Beitbridge. Fast, reliable, and secure.
          </p>

          {/* Login Button Only */}
          <Link
            to="/login"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg shadow-md transition"
          >
            Login
          </Link>
        </div>

        {/* Right Side Icon / Illustration */}
        <div className="flex-1 flex flex-col items-center text-center">
          <div className="bg-blue-50 w-80 h-80 rounded-2xl flex items-center justify-center shadow">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-32 h-32 text-blue-600 "
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-9 4v8"
              />
            </svg>
          </div>

          <p className="text-gray-500 mt-4 text-sm">
            Seamless IT assistance for the whole organization
          </p>
        </div>
      </div>

      {/* Footer */}
      <p className="text-gray-500 text-xs mt-6">
        © {new Date().getFullYear()} Municipality of Beitbridge • Internal Use
        Only
      </p>
    </div>
  );
}

export default Home;
