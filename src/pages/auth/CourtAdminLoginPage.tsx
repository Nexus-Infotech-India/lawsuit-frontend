import { FC, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCourtAdminStore } from '../../stores/courtAdminStore';

const CourtAdminLoginPage: FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { login, isLoading } = useCourtAdminStore();

    const handleSignIn = async () => {
        setError(null);
        try {
            await login(email, password);
            navigate('/court-admin/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || err.message || 'Login failed');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-md border border-gray-100">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Court Admin Portal
                    </h2>
                    <div className="mt-4 flex justify-center gap-4">
                        <button
                            type="button"
                            className="text-sm px-4 py-2 border border-transparent rounded-md text-gray-600 hover:text-indigo-600 hover:bg-gray-100 focus:outline-none"
                            onClick={() => navigate('/auth/login')}
                        >
                            Client / Lawyer
                        </button>
                        <button
                            type="button"
                            className="text-sm px-4 py-2 border border-transparent rounded-md text-white bg-indigo-600 pointer-events-none focus:outline-none"
                        >
                            Court Admin
                        </button>
                    </div>
                    <p className="mt-4 text-center text-sm text-gray-600">
                        Sign in to manage lawyer verifications
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); handleSignIn(); }}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div className="mb-4">
                            <label htmlFor="email-address" className="sr-only">Email address</label>
                            <input
                                id="email-address"
                                name="email"
                                type="email"
                                required
                                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="Email address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && <div className="text-sm text-red-600 font-medium text-center">{error}</div>}

                    <div>
                        <button
                            type="submit"
                            disabled={isLoading || !email || !password}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
                        >
                            {isLoading ? 'Signing in...' : 'Sign in'}
                        </button>
                    </div>

                    <div className="flex items-center justify-between text-sm pt-2">
                        <Link to="/auth/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-700">
                            Forgot password?
                        </Link>
                        <Link to="/auth/court-admin-register" className="font-medium text-indigo-600 hover:text-indigo-700">
                            Create an account
                        </Link>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CourtAdminLoginPage;
