import {
  formatDate,
  formatTime,
  calculateHours,
  getRecordStatus,
} from "../utils/attendance";
import Avatar from "./Avatar";
import StatusBadge from "./StatusBadge";

function RecordsTable({ records, employees = [], showEmployee = true }) {
  const getName = (employeeId) =>
    employees.find((e) => e.id === employeeId)?.name ?? "Unknown";

  // Copy first so the original state array is never changed
  const newestFirst = [...records].reverse();

  return (
    <div className="table-wrapper">
      <table className="data-table data-table--records">
        <thead>
          <tr>
            {showEmployee && <th>Employee</th>}
            {showEmployee && <th>ID</th>}
            <th>Date</th>
            <th>Time In</th>
            <th>Time Out</th>
            <th>Hours Worked</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst.map((record) => {
            const name = showEmployee ? getName(record.employeeId) : "";
            return (
              <tr key={record.id}>
                {showEmployee && (
                  <td>
                    <div className="employee-cell">
                      <Avatar name={name} size="sm" />
                      <span className="employee-cell__name">{name}</span>
                    </div>
                  </td>
                )}
                {showEmployee && <td className="cell-id">{record.employeeId}</td>}
                <td>{formatDate(record.timeIn)}</td>
                <td className="cell-num">{formatTime(record.timeIn)}</td>
                <td className="cell-num">{formatTime(record.timeOut)}</td>
                <td className="cell-num">
                  {calculateHours(record.timeIn, record.timeOut)}
                </td>
                <td>
                  <StatusBadge status={getRecordStatus(record)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default RecordsTable;