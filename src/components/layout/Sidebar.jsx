import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function Sidebar() {
  const location = useLocation();
  const { user, isAdmin, isOperator } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: '📊', allowedRoles: ['admin', 'operator', 'viewer'] },
    { name: 'Campaigns', href: '/campaigns', icon: '📢', allowedRoles: ['admin', 'operator', 'viewer'] },
    { name: 'Sessions', href: '/sessions', icon: '📱', allowedRoles: ['admin', 'operator', 'viewer'] },
    { name: 'Settings', href: '/settings', icon: '⚙️', allowedRoles: ['admin'] },
  ];

  const isActive = (href) => {
    if (href === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(href);
  };

  const canAccess = (allowedRoles) => {
    if (!user) return false;
    return allowedRoles.includes(user.role);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 min-h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-primary-600">
          WA Blast
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Management System
        </p>
      </div>

      <nav className="px-4 space-y-1">
        {navigation.map((item) => (
          canAccess(item.allowedRoles) && (
            <Link
              key={item.name}
              to={item.href}
              className={`
                flex items-center px-4 py-3 rounded-lg transition-colors
                ${isActive(item.href)
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
                }
              `}
            >
              <span className="text-xl mr-3">{item.icon}</span>
              {item.name}
            </Link>
          )
        ))}
      </nav>

      <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200 bg-white">
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold">
            {user?.full_name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.full_name || 'User'}
            </p>
            <p className="text-xs text-gray-500 capitalize">
              {user?.role || 'viewer'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
