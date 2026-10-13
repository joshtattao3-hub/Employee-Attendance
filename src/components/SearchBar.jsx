import { SearchIcon, CloseIcon } from "./Icons";

function SearchBar({ value, onChange }) {
  return (
    <div className="search-field">
      <span className="search-field__icon">
        <SearchIcon size={18} />
      </span>
      <input
        type="text"
        className="search-field__input"
        placeholder="Search by name or ID"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        aria-label="Search employees by name or ID"
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="icon-btn search-field__clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

export default SearchBar;