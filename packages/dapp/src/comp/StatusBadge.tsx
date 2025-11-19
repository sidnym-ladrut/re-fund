interface StatusBadgeProps {
  status: 'active' | 'pending' | 'completed' | 'locked' | 'unlocked';
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 border-green-300',
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    completed: 'bg-blue-100 text-blue-800 border-blue-300',
    locked: 'bg-purple-100 text-purple-800 border-purple-300',
    unlocked: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  return (
    <span 
      className={`inline-block px-3 py-1 text-sm font-medium rounded-full border ${statusColors[status]} ${className}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
