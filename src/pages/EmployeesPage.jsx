import { useState } from "react";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import { getStatus } from "../utils/attendance";
import Avatar from "../components/Avatar";
import StatusBadge from "../components/StatusBadge";
import SearchBar from "../components/SearchBar";
import Modal from "../components/Modal";
import EmployeeForm from "../components/EmployeeForm";
import { SearchIcon, PlusIcon, AlertCircleIcon } from "../components/Icons";

function EmployeesPage({ records, readOnly = false }) {
  const {
    employees,
    branches,
    addEmployee,
    updateEmployee,
    setEmployeeActive,
  } = useData();
  const { showToast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // null, { type: "add" }, { type: "edit", employee }, or { type: "deactivate", employee }
  const [modal, setModal] = useState(null);
  const [working, setWorking] = useState(false);

  const query = searchTerm.trim().toLowerCase();
  const filtered = employees.filter((emp) => {
    const isActive = emp.active !== false;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" ? isActive : !isActive);
    const matchesSearch = [emp.name, emp.id, emp.email, emp.branchName, emp.position]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  const activeCount = employees.filter((e) => e.active !== false).length;
  const hasFilters = query !== "" || statusFilter !== "all";
  const subtitle = hasFilters
    ? `${filtered.length} of ${employees.length} employees`
    : `${employees.length} employees · ${activeCount} active`;

  function clearFilters() {
    setSearchTerm("");
    setStatusFilter("all");
  }

  async function handleSave(values) {
    const isAdd = modal.type === "add";
    const result = isAdd
      ? await addEmployee(values)
      : await updateEmployee(modal.employee.id, values);

    if (result.ok) {
      showToast(
        "success",
        isAdd
          ? `${result.employee.name} was added as ${result.employee.id}.`
          : `Changes to ${result.employee.name} were saved.`
      );
      setModal(null);
    }
    return result;
  }

  async function handleDeactivate() {
    if (working) return;
    setWorking(true);
    const target = modal.employee;
    const result = await setEmployeeActive(target.id, false);
    setWorking(false);

    if (!result.ok) {
      showToast("error", result.error);
      return;
    }
    showToast("success", `${target.name} was deactivated.`);
    setModal(null);
  }

  async function handleReactivate(emp) {
    const result = await setEmployeeActive(emp.id, true);
    showToast(
      result.ok ? "success" : "error",
      result.ok ? `${emp.name} was reactivated.` : result.error
    );
  }

  const modalTitle =
    modal?.type === "add"
      ? "Add employee"
      : modal?.type === "edit"
        ? "Edit employee"
        : modal?.type === "deactivate"
          ? "Deactivate employee"
          : "";

  return (
    <>
      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">{readOnly ? "Team" : "Employee directory"}</h2>
            <p className="panel__subtitle">{subtitle}</p>
          </div>
          {!readOnly && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setModal({ type: "add" })}
          >
            <PlusIcon size={16} />
            Add employee
          </button>
          )}
        </div>

        <div className="toolbar">
          <SearchBar value={searchTerm} onChange={setSearchTerm} />
          <label className="field">
            <span className="field__label">Show</span>
            <select
              className="field__control"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All employees</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </label>
          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <SearchIcon size={22} />
            </span>
            <h3 className="empty-state__title">No employees found</h3>
            <p className="empty-state__text">
              Nothing matches your current search and filter. Try adjusting or
              clearing them.
            </p>
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>ID</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Today</th>
                  {!readOnly && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const isActive = emp.active !== false;
                  return (
                    <tr key={emp.id} className={isActive ? "" : "row--inactive"}>
                      <td>
                        <div className="employee-cell">
                          <Avatar name={emp.name} />
                          <div className="employee-cell__text">
                            <span className="employee-cell__name">{emp.name}</span>
                            <span className="employee-cell__sub">{emp.email ?? "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="cell-id">{emp.id}</td>
                      <td>
                        <div className="employee-cell__text">
                          <span>{emp.branchName}</span>
                          <span className="employee-cell__sub">{emp.position || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={isActive ? "Active" : "Inactive"} />
                      </td>
                      <td>
                        {isActive ? (
                          <StatusBadge status={getStatus(records, emp.id)} />
                        ) : (
                          <span className="cell-muted">—</span>
                        )}
                      </td>
                      {!readOnly && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setModal({ type: "edit", employee: emp })}
                            aria-label={`Edit ${emp.name}`}
                          >
                            Edit
                          </button>
                          {isActive ? (
                            <button
                              type="button"
                              className="btn-danger-outline btn-sm"
                              onClick={() =>
                                setModal({ type: "deactivate", employee: emp })
                              }
                              aria-label={`Deactivate ${emp.name}`}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => handleReactivate(emp)}
                              aria-label={`Reactivate ${emp.name}`}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal open={modal !== null} title={modalTitle} onClose={() => setModal(null)}>
        {(modal?.type === "add" || modal?.type === "edit") && (
          <EmployeeForm
            mode={modal.type}
            employee={modal.employee}
            emailLocked={modal.type === "edit" && modal.employee.hasLogin}
            branches={branches}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
          />
        )}

        {modal?.type === "deactivate" && (
          <>
            <div className="modal__body">
              <p className="modal__text">
                Deactivate <strong>{modal.employee.name}</strong>? They won’t be
                able to sign in or clock in, and they’ll be left out of today’s
                summary. Their attendance history is kept, and you can
                reactivate them at any time.
              </p>
              {getStatus(records, modal.employee.id) === "Timed In" && (
                <div className="alert alert--warning" role="status">
                  <AlertCircleIcon size={18} />
                  <span>
                    They’re clocked in right now. Their open shift stays open
                    until it’s corrected.
                  </span>
                </div>
              )}
            </div>
            <div className="modal__footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setModal(null)}
                disabled={working}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDeactivate}
                disabled={working}
              >
                {working ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

export default EmployeesPage;