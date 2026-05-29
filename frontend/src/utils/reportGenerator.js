// frontend/src/utils/reportGenerator.js
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/**
 * generateReport
 * @param {Array}  requests      - The ALREADY-FILTERED array to print (not allRequests)
 * @param {string} role          - "office" | "student" | "supervisor"
 * @param {object} filters       - Active filter state (for the summary block)
 * @param {boolean} isPaginated  - (unused, kept for backwards compat)
 * @param {number} totalCount    - Total unfiltered record count (for context line)
 * @param {object} options       - { myTasksOnly, myTasksLabel } for student "My Tasks"
 */
const generateReport = (
  requests,
  role,
  filters = {},
  isPaginated = false,
  totalCount = 0,
  options = {}
) => {
  if (!requests || requests.length === 0) {
    // Caller should check return value and show toast
  return false;
    return;
  }

  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleDateString();
  const timeStr = now.toLocaleTimeString();

  // ── Build a human-readable description of the active filters ──────────────
  const activeFilters = [];

  if (options.myTasksOnly) {
    activeFilters.push(`View: My Tasks only (${options.myTasksLabel || role})`);
  }
  if (filters.status && filters.status !== "all") {
    activeFilters.push(`Status: ${filters.status === "resolved" ? "Resolved" : "Pending"}`);
  }
  if (filters.month) {
    activeFilters.push(`Month: ${MONTH_NAMES[parseInt(filters.month) - 1]}`);
  }
  if (filters.year) {
    activeFilters.push(`Year: ${filters.year}`);
  }
  if (filters.office) {
    activeFilters.push(`Office: ${filters.office}`);
  }
  if (filters.assignedTo) {
    if (filters.assignedTo === "__unassigned__") {
      activeFilters.push("Assigned To: Unassigned");
    } else if (filters.assignedToName) {
      activeFilters.push(`Assigned To: ${filters.assignedToName}`);
    }
  }

  const filterSummary =
    activeFilters.length > 0
      ? activeFilters.join(" | ")
      : "All records (no filters applied)";

  // ── Filename reflects filters ──────────────────────────────────────────────
  const filterSlug = activeFilters.length
    ? "_" + activeFilters.map(f => f.replace(/[^a-zA-Z0-9]/g, "_")).join("__").substring(0, 60)
    : "_All";
  const fileName = `ITSolve_${role}_Report${filterSlug}_${dateStr.replace(/\//g, "-")}.pdf`;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFontSize(18);
  doc.setTextColor(30, 80, 160);
  doc.text(`ITSolve Report — ${role.charAt(0).toUpperCase() + role.slice(1)}`, 14, 22);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${dateStr} ${timeStr}`, 14, 30);

  // ── Filter summary block ───────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(`Filters: ${filterSummary}`, 14, 38);
  doc.text(
    `Records in this report: ${requests.length}${totalCount && totalCount !== requests.length ? ` of ${totalCount} total` : ""}`,
    14,
    46
  );

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(14, 50, 196, 50);

  // ── Table definition by role ───────────────────────────────────────────────
  let tableColumn = [];
  let tableRows = [];

  if (role === "office") {
    tableColumn = ["#", "Description", "Status", "Created", "Resolved At"];
    tableRows = requests.map((r, i) => [
      i + 1,
      r.description || r.title || "—",
      r.status === "resolved" ? "Resolved" : "Pending",
      new Date(r.createdAt).toLocaleString(),
      r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : "—",
    ]);
  } else if (role === "student") {
    tableColumn = ["#", "Description", "Office / Requester", "Assigned To", "Status", "Created", "Resolved At"];
    tableRows = requests.map((r, i) => [
      i + 1,
      r.description || r.title || "—",
      r.requestedBy?.office || r.requestedBy?.name || "—",
      r.assignedTo?.name || "Unassigned",
      r.status === "resolved" ? "Resolved" : "Pending",
      new Date(r.createdAt).toLocaleString(),
      r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : "—",
    ]);
  } else if (role === "supervisor") {
    tableColumn = ["#", "Description", "Office", "Assigned To", "Status", "Created", "Resolved At"];
    tableRows = requests.map((r, i) => [
      i + 1,
      r.description || r.title || "—",
      r.requestedBy?.office || r.requestedBy?.name || "N/A",
      r.assignedTo?.name || "Unassigned",
      r.status === "resolved" ? "Resolved" : "Pending",
      new Date(r.createdAt).toLocaleString(),
      r.resolvedAt ? new Date(r.resolvedAt).toLocaleString() : "—",
    ]);
  }

  // ── Draw table ─────────────────────────────────────────────────────────────
  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 55,
    theme: "grid",
    headStyles: { fillColor: [30, 80, 160], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    columnStyles: { 0: { cellWidth: 8 } },
    styles: { fontSize: 8, cellPadding: 2 },
    didDrawPage: (data) => {
      // Repeat filter summary as a small watermark header on continuation pages
      if (data.pageNumber > 1) {
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`ITSolve ${role} Report  |  Filters: ${filterSummary}`, 14, 10);
      }
    },
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Page ${i} of ${pageCount}  •  ${requests.length} record${requests.length !== 1 ? "s" : ""}  •  ${filterSummary}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 8,
      { align: "center" }
    );
  }

  doc.save(fileName);
  return true;
};

export default generateReport;
