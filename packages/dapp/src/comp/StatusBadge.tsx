import { capitalize } from "@/lib/util";
import { FundStatus } from "@/type";

interface StatusBadgeProps {
  status: FundStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    active: 'bg-green-100 text-green-800 border-green-300',
    closed: 'bg-blue-100 text-blue-800 border-blue-300',
  };

  return (
    <span
      className={`inline-block px-3 py-1 text-sm font-medium rounded-full border ${statusColors[status]} ${className}`}
    >
      {capitalize(status)}
    </span>
  );
}
