import { useState } from "react";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import BranchForm from "../components/BranchForm";
import { PlusIcon, BranchIcon } from "../components/Icons";

function BranchesPage() {
  const { branches, employees, addBranch, updateBranch } = useData();
  const { showToast } = useToast();

  // null, { type: "add" }, or { type: "edit", branch }
  const [modal, setModal] = useState(null);

  function activeCount(branchId) {
    return employees.filter((e) => e.branchId === branchId && e.active !== false).length;
  }

  async function handleSave(values) {
    const isAdd = modal.type === "add";
    const result = isAdd
      ? await addBranch(values)
      : await updateBranch(modal.branch.id, values);

    if (result.ok) {
      showToast(
        "success",
        isAdd
          ? `${result.branch.name} was added.`
          : `Changes to ${result.branch.name} were saved.`
      );
      setModal(null);
    }
    return result;
  }

  const subtitle = `${branches.length} ${branches.length === 1 ? "branch" : "branches"}`;

  return (
    <>
      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">Branches</h2>
            <p className="panel__subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setModal({ type: "add" })}
          >
            <PlusIcon size={16} />
            Add branch
          </button>
        </div>

        {branches.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <BranchIcon size={22} />
            </span>
            <h3 className="empty-state__title">No branches yet</h3>
            <p className="empty-state__text">
              Add your first branch so employees can be assigned to it.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModal({ type: "add" })}
            >
              Add branch
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Address</th>
                  <th>Time zone</th>
                  <th>Active employees</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td>
                      <span className="employee-cell__name">{branch.name}</span>
                    </td>
                    <td>
                      {branch.address ? (
                        branch.address
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </td>
                    <td className="cell-id">{branch.timezone}</td>
                    <td>{activeCount(branch.id)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setModal({ type: "edit", branch })}
                          aria-label={`Edit ${branch.name}`}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={modal !== null}
        title={modal?.type === "edit" ? "Edit branch" : "Add branch"}
        onClose={() => setModal(null)}
      >
        {modal !== null && (
          <BranchForm
            mode={modal.type}
            branch={modal.branch}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}

export default BranchesPage;