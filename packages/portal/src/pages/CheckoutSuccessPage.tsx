import { Link } from 'react-router-dom';

export function CheckoutSuccessPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <span className="text-3xl text-green-600">&#10003;</span>
        </div>
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Subscription Active!</h1>
        <p className="mt-2 text-gray-600">
          Your subscription has been created successfully.
        </p>
        <p className="mt-4 text-sm text-gray-600">
          Next step: register your Power Platform environment and generate an activation code.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            to="/licences"
            className="rounded-lg bg-teal px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-dark"
          >
            Manage Environments
          </Link>
          <Link
            to="/dashboard"
            className="rounded-lg bg-gray-100 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
