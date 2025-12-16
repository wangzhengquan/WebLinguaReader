import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-500 shadow-sm",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    icon: "p-2 text-slate-600 hover:bg-slate-100 rounded-full"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  const variantStyles = variants[variant];
  const sizeStyles = variant === 'icon' ? '' : sizes[size];

  return (
    <button 
      className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};
