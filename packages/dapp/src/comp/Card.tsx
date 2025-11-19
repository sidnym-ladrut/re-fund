import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', title, onClick }: CardProps) {
  const baseClasses = 'bg-white border-2 border-gray-200 rounded-lg p-6 transition-all duration-300';
  const interactiveClasses = onClick ? 'hover:border-black hover:shadow-lg cursor-pointer' : '';
  
  return (
    <div 
      className={`${baseClasses} ${interactiveClasses} ${className}`}
      onClick={onClick}
    >
      {title && <h3 className="mb-4">{title}</h3>}
      {children}
    </div>
  );
}
