'use client';

import React from 'react';
import type {
  InsightFilters,
  InsightTimeFilter,
  InsightColorFilter,
  InsightDateFilter,
} from '@/features/profile-insights/types';

export interface InsightsFilterBarProps {
  filters: InsightFilters;
  onChange: (filters: InsightFilters) => void;
  disabled?: boolean;
}

const TIME_OPTIONS: { value: InsightTimeFilter; label: string }[] = [
  { value: 'all', label: 'All Time Controls' },
  { value: 'rapid', label: 'Rapid' },
  { value: 'blitz', label: 'Blitz' },
  { value: 'bullet', label: 'Bullet' },
  { value: 'daily', label: 'Daily' },
];

const COLOR_OPTIONS: { value: InsightColorFilter; label: string }[] = [
  { value: 'all', label: 'Both Colors' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

const DATE_OPTIONS: { value: InsightDateFilter; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '365d', label: 'Last 1 Year' },
];

export function InsightsFilterBar({
  filters,
  onChange,
  disabled = false,
}: InsightsFilterBarProps): React.JSX.Element {
  const setTimeClass = (timeClass: InsightTimeFilter) => {
    onChange({ ...filters, timeClass });
  };

  const setColor = (color: InsightColorFilter) => {
    onChange({ ...filters, color });
  };

  const setDateRange = (dateRange: InsightDateFilter) => {
    onChange({ ...filters, dateRange });
  };

  return (
    <div className="profile-filter-bar" role="toolbar" aria-label="Insights Filters">
      <div className="profile-filter-group" role="radiogroup" aria-label="Time Control Filter">
        <span className="profile-filter-label">Speed:</span>
        <div className="profile-filter-buttons">
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={filters.timeClass === opt.value}
              disabled={disabled}
              className={`profile-filter-btn ${filters.timeClass === opt.value ? 'profile-filter-btn--active' : ''}`}
              onClick={() => setTimeClass(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-filter-group" role="radiogroup" aria-label="Color Filter">
        <span className="profile-filter-label">Color:</span>
        <div className="profile-filter-buttons">
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={filters.color === opt.value}
              disabled={disabled}
              className={`profile-filter-btn ${filters.color === opt.value ? 'profile-filter-btn--active' : ''}`}
              onClick={() => setColor(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="profile-filter-group" role="radiogroup" aria-label="Date Range Filter">
        <span className="profile-filter-label">Range:</span>
        <div className="profile-filter-buttons">
          {DATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={filters.dateRange === opt.value}
              disabled={disabled}
              className={`profile-filter-btn ${filters.dateRange === opt.value ? 'profile-filter-btn--active' : ''}`}
              onClick={() => setDateRange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
