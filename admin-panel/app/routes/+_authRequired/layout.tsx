import {
  Link,
  Outlet,
  redirect,
  useLoaderData,
  useNavigate,
  type LoaderFunctionArgs,
} from "react-router";
import { authClient } from "~/lib/auth-client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { data: session, error } = await authClient.getSession({
    fetchOptions: {
      headers: request.headers,
    },
  });

  if (error || !session || !session.user) {
    throw redirect("/login");
  }

  return { user: session.user };
};

export default function AuthRequired() {
  const { user } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate("/login");
        },
      },
    });
  };

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <Link to="/" className="btn btn-ghost text-xl">Subroutine Admin</Link>
        </div>
        <div className="flex-none gap-2">
          <div className="dropdown dropdown-end">
            <div
              tabIndex={0}
              role="button"
              className="btn btn-ghost btn-circle avatar placeholder"
            >
              <div className="bg-neutral text-neutral-content w-10 rounded-full">
                <span className="text-xl">
                  {user.name?.charAt(0) || user.email.charAt(0)}
                </span>
              </div>
            </div>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-base-100 rounded-box z-[1] mt-3 w-52 p-2 shadow"
            >
              <li className="menu-title">
                <span>{user.email}</span>
              </li>
              <li>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left"
                >
                  Logout
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-4">
        <Outlet />
      </div>
    </div>
  );
}
