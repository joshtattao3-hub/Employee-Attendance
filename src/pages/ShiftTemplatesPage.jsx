import { useState } from "react";
import { useData } from "../hooks/useData";
import { useToast } from "../hooks/useToast";
import Modal from "../components/Modal";
import ShiftTemplateForm from "../components/ShiftTemplateForm";
import { PlusIcon, ClockIcon } from "../components/Icons";
import { formatShiftTime, formatPaidHours } from "../utils/shifts";

function ShiftTemplatesPage({ readOnly = false }) {
  const { shiftTemplates, addShiftTemplate, updateShiftTemplate, setShiftTemplateActive } =
    useData();
  const { showToast } = useToast();

  // null, { type: "add" }, or { type: "edit", template }
  const [modal, setModal] = useState(null);
  // Which row is being switched on or off (blocks double clicks)
  const [pendingId, setPendingId] = useState(null);

  async function handleSave(values) {
    const isAdd = modal.type === "add";
    const result = isAdd
      ? await addShiftTemplate(values)
      : await updateShiftTemplate(modal.template.id, values);

    if (result.ok) {
      showToast(
        "success",
        isAdd
          ? `${result.template.name} was added.`
          : `Changes to ${result.template.name} were saved.`
      );
      setModal(null);
    }
    return result;
  }

  async function handleToggle(template) {
    if (pendingId) return;
    setPendingId(template.id);
    const result = await setShiftTemplateActive(template.id, !template.active);
    setPendingId(null);

    if (result.ok) {
      showToast(
        "success",
        `${template.name} was switched ${template.active ? "off" : "on"}.`
      );
    } else {
      showToast("error", result.error);
    }
  }

  const activeCount = shiftTemplates.filter((t) => t.active).length;
  const subtitle = `${shiftTemplates.length} ${
    shiftTemplates.length === 1 ? "shift" : "shifts"
  } · ${activeCount} active`;

  return (
    <>
      <section className="card panel">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">Shift templates</h2>
            <p className="panel__subtitle">{subtitle}</p>
            <p className="panel__subtitle">
              Reusable shift times. Editing one doesn’t change shifts already scheduled.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setModal({ type: "add" })}
            >
              <PlusIcon size={16} />
              Add shift
            </button>
          )}
        </div>

        {shiftTemplates.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">
              <ClockIcon size={22} />
            </span>
            <h3 className="empty-state__title">No shifts yet</h3>
            <p className="empty-state__text">
              {readOnly
                ? "An administrator needs to add shift templates before schedules can be made."
                : "Add your first shift, like “Morning 8:00 AM to 5:00 PM”."}
            </p>
            {!readOnly && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setModal({ type: "add" })}
              >
                Add shift
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>Time</th>
                  <th>Break</th>
                  <th>Paid hours</th>
                  <th>Status</th>
                  {!readOnly && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shiftTemplates.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="employee-cell__name">{t.name}</span>
                    </td>
                    <td className="cell-id">
                      {formatShiftTime(t.startTime)} – {formatShiftTime(t.endTime)}
                      {t.crossesMidnight && " (next day)"}
                    </td>
                    <td>{t.breakMinutes} min</td>
                    <td>{formatPaidHours(t.startTime, t.endTime, t.breakMinutes)}</td>
                    <td>{t.active ? "Active" : <span className="cell-muted">Off</span>}</td>
                    {!readOnly && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => setModal({ type: "edit", template: t })}
                            aria-label={`Edit ${t.name}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleToggle(t)}
                            disabled={pendingId !== null}
                            aria-label={`${t.active ? "Switch off" : "Switch on"} ${t.name}`}
                          >
                            {t.active ? "Switch off" : "Switch on"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={modal !== null}
        title={modal?.type === "edit" ? "Edit shift" : "Add shift"}
        onClose={() => setModal(null)}
      >
        {modal !== null && (
          <ShiftTemplateForm
            mode={modal.type}
            template={modal.template}
            onSubmit={handleSave}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </>
  );
}

export default ShiftTemplatesPage;