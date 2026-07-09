import { useNavigate } from 'react-router-dom';
import { AuthShell } from './components/AuthShell';
import { RegisterForm } from './components/RegisterForm';
import { useRegister } from './useRegister';

/**
 * Standalone route (not wrapped in AppShell). Registration also logs the
 * user in, so a successful submit redirects straight into the app — no
 * intermediate "now go log in" step.
 */
export function RegisterPage() {
  const navigate = useNavigate();
  const { register, isPending, errorMessage } = useRegister({
    onSuccess: () => navigate('/'),
  });

  return (
    <AuthShell>
      <RegisterForm onSubmit={register} isPending={isPending} errorMessage={errorMessage} />
    </AuthShell>
  );
}
