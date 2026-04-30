import { FC, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useCourtAdminStore } from '../stores/courtAdminStore';

const CourtAdminLayout: FC = () => {
    const [collapsed, setCollapsed] = useState(false);
    const { logout, user } = useCourtAdminStore();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/auth/court-admin-login');
    };

    const navItems = [
        {
            to: '/court-admin/dashboard',
            label: 'Lawyer verifications',
            icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 13h8V3H3v10zM3 21h8v-6H3v6zM13 21h8V11h-8v10zM13 3v6h8V3h-8z" fill="currentColor" />
                </svg>
            )
        },
        {
            to: '/court-admin/organization-verifications',
            label: 'Organization verifications',
            icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 21V8l9-5 9 5v13H3zm6-2h6v-7H9v7z" fill="currentColor" />
                </svg>
            )
        },
        {
            to: '/court-admin/profile',
            label: 'Profile',
            icon: (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 11c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM6 11c1.657 0 3-1.343 3-3S7.657 5 6 5 3 6.343 3 8s1.343 3 3 3zM6 13c-2.33 0-7 1.17-7 3.5V19h20v-2.5C19 14.17 14.33 13 12 13H6z" fill="currentColor" />
                </svg>
            )
        },
    ];

    return (
        <div className="min-h-screen flex bg-gray-100">
            {/* Sidebar */}
            <aside className={`${collapsed ? 'w-20' : 'w-64'} bg-white border-r transition-all duration-200 flex flex-col`}>
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-indigo-600 text-white rounded flex items-center justify-center font-bold">CA</div>
                        {!collapsed && <div className="font-semibold text-gray-800">Court Admin</div>}
                    </div>
                    <button
                        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        onClick={() => setCollapsed(s => !s)}
                        className="p-1 rounded hover:bg-gray-100"
                    >
                        <svg className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d={collapsed ? 'M11 5l6 7-6 7' : 'M13 5l-6 7 6 7'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto p-2 space-y-1">
                    {navItems.map(item => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            title={item.label}
                            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded text-sm hover:bg-gray-50 ${isActive ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                        >
                            <div className="w-6 text-center flex items-center justify-center">{item.icon}</div>
                            {!collapsed && <span>{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                <div className="p-3 border-t">
                    <button
                        onClick={handleLogout}
                        className="w-full text-sm text-left px-3 py-2 rounded hover:bg-red-50 text-red-600 font-medium flex items-center gap-3"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        {!collapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            {/* Main content area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top bar */}
                <header className="bg-white border-b shadow-sm z-10 relative">
                    <div className="max-w-full mx-auto px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button className="md:hidden p-2 rounded hover:bg-gray-100" onClick={() => setCollapsed(s => !s)}>
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <h2 className="text-xl font-semibold text-gray-800">Court Administration Portal</h2>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Profile placeholder */}
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-gray-700 hidden sm:block">{user?.name || 'Admin'}</span>
                                <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold shadow-sm">
                                    {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex-1 overflow-auto bg-gray-50 p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default CourtAdminLayout;
