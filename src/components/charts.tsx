"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDay } from "@/lib/dates";
import { formatCurrency, formatHour, formatNumber, formatPercent } from "@/lib/format";
import type { DashboardData } from "@/lib/types";

const axis = { fontSize: 12, fill: "#5c6d7e" };

export function RevenueChart({ data }: { data: DashboardData["revenueSeries"] }) {
  const rows = data.map((point) => ({
    ...point,
    label: formatDay(point.date, false),
  }));
  const hasBudget = data.some((point) => point.budget != null);
  const hasLastYear = data.some((point) => point.lastYear != null);
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6eef6" vertical={false} />
          <XAxis dataKey="label" tick={axis} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={axis} tickFormatter={(value) => formatCurrency(Number(value)).replace(".00", "")} width={72} />
          <Tooltip formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name]} />
          <Legend />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#0c5eae" strokeWidth={2.4} dot={false} />
          {hasBudget ? <Line type="monotone" dataKey="budget" name="Budget" stroke="#7aa6d4" strokeDasharray="5 4" dot={false} /> : null}
          {hasLastYear ? <Line type="monotone" dataKey="lastYear" name="Last year" stroke="#8b97a3" strokeDasharray="2 3" dot={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DepartmentChart({ data }: { data: DashboardData["departments"] }) {
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e6eef6" horizontal={false} />
          <XAxis type="number" tick={axis} tickFormatter={(value) => formatCurrency(Number(value))} />
          <YAxis type="category" dataKey="name" width={128} tick={axis} />
          <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
          <Bar dataKey="revenue" name="Revenue" fill="#0c5eae" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourChart({ data }: { data: DashboardData["hours"] }) {
  const rows = data.map((point) => ({ ...point, label: formatHour(point.hour) }));
  const hasUnits = data.some((point) => point.units > 0);
  const hasTransactions = data.some((point) => point.transactions > 0);
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows}>
          <CartesianGrid stroke="#e6eef6" vertical={false} />
          <XAxis dataKey="label" tick={axis} />
          <YAxis yAxisId="left" tick={axis} tickFormatter={(value) => formatCurrency(Number(value))} width={72} />
          {hasUnits || hasTransactions ? <YAxis yAxisId="right" orientation="right" tick={axis} width={48} /> : null}
          <Tooltip
            formatter={(value, name) => {
              if (name === "Revenue") return [formatCurrency(Number(value ?? 0)), name];
              return [formatNumber(Number(value ?? 0)), name];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#1d74c7" radius={[4, 4, 0, 0]} />
          {hasUnits ? <Line yAxisId="right" type="monotone" dataKey="units" name="Units" stroke="#06284a" dot={false} /> : null}
          {hasTransactions ? <Line yAxisId="right" type="monotone" dataKey="transactions" name="Transactions" stroke="#7aa6d4" dot={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LaborChart({ data }: { data: DashboardData["labor"] }) {
  const rows = data.map((point) => ({
    ...point,
    label: formatDay(point.period, false),
    laborPercent: point.laborPercent ?? 0,
  }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows}>
          <CartesianGrid stroke="#e6eef6" vertical={false} />
          <XAxis dataKey="label" tick={axis} minTickGap={20} />
          <YAxis yAxisId="left" tick={axis} tickFormatter={(value) => `${value}%`} width={48} />
          <YAxis yAxisId="right" orientation="right" tick={axis} tickFormatter={(value) => formatCurrency(Number(value))} width={72} />
          <Tooltip
            formatter={(value, name) => {
              if (name === "Labor %") return [formatPercent(Number(value ?? 0)), name];
              return [formatCurrency(Number(value ?? 0)), name];
            }}
          />
          <Legend />
          <Bar yAxisId="left" dataKey="laborPercent" name="Labor %" fill="#0c5eae" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#8b97a3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EcommerceChart({ data }: { data: DashboardData["ecommerce"] }) {
  const rows = data.map((point) => ({ ...point, label: formatDay(point.period, false) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows}>
          <CartesianGrid stroke="#e6eef6" vertical={false} />
          <XAxis dataKey="label" tick={axis} minTickGap={20} />
          <YAxis tick={axis} tickFormatter={(value) => formatCurrency(Number(value))} width={72} />
          <Tooltip formatter={(value, name) => (name === "Items sold" || name === "Items sent" ? formatNumber(Number(value ?? 0)) : formatCurrency(Number(value ?? 0)))} />
          <Legend />
          <Line type="monotone" dataKey="revenue" name="Ecommerce revenue" stroke="#0c5eae" dot={false} />
          <Line type="monotone" dataKey="goal" name="Goal" stroke="#7aa6d4" strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProductionChart({ data }: { data: DashboardData["production"] }) {
  const rows = data.map((point) => ({ ...point, label: formatDay(point.period, false) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid stroke="#e6eef6" vertical={false} />
          <XAxis dataKey="label" tick={axis} minTickGap={20} />
          <YAxis tick={axis} />
          <Tooltip />
          <Legend />
          <Bar dataKey="racks" name="Racks" fill="#0c5eae" />
          <Bar dataKey="totes" name="Totes" fill="#7aa6d4" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
