import { isRouteErrorResponse, Link, useRouteError } from "react-router";

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">{message}</h1>
      <Link to="/" className="mt-4 inline-block text-accent underline">
        Back to home
      </Link>
    </div>
  );
}
