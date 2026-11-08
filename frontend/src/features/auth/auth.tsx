import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

import { api, ApiError } from "@/api/client";
import type { UserOut } from "@/api/generated/schema";
import { ErrorAlert, Loading } from "@/components/feedback";

export const ME_KEY = ["me"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.get<UserOut>("/users/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    /** With `role`, an account of the other type is signed straight back out with a clear message. */
    mutationFn: async ({ role, ...body }: { email: string; password: string; role?: "teacher" | "student" }) => {
      const user = await api.post<UserOut>("/auth/login", body);
      if (role && user.account_type !== role) {
        await api.post<void>("/auth/logout").catch(() => undefined);
        const other = user.account_type === "teacher" ? "teacher" : "student";
        throw new Error(`This is a ${other} account. Choose “I’m a ${other}” above to sign in.`);
      }
      return user;
    },
    onSuccess: (user) => { qc.clear(); qc.setQueryData(ME_KEY, user); },
  });
}

/** Demo mode (local demos): no sign-in, the app enters as the demo teacher or student. */
export function useDemoMode() {
  const q = useQuery({
    queryKey: ["auth-demo"],
    queryFn: () => api.get<{ enabled: boolean }>("/auth/demo"),
    staleTime: Infinity,
    retry: false,
  });
  return { enabled: q.data?.enabled ?? false, pending: q.isPending };
}

export function useDemoLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: "teacher" | "student") => api.post<UserOut>("/auth/demo-login", { role }),
    onSuccess: (user) => {
      // Keep "me" and the demo flag: clear() would orphan them and mounted components (the
      // header) would go on showing the previous account after a switch.
      qc.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] && query.queryKey[0] !== "auth-demo" });
      qc.setQueryData(ME_KEY, user);
    },
  });
}

/** Demo mode: signs in as `role` (switching account if needed), then shows `children`. */
export function DemoEnter({ role, children }: { role: "teacher" | "student"; children?: ReactNode }) {
  const me = useMe();
  const demo = useDemoLogin();
  const ready = me.data?.account_type === role;
  const { mutate, isIdle } = demo;
  useEffect(() => {
    if (!me.isPending && !ready && isIdle) mutate(role);
  }, [me.isPending, ready, isIdle, mutate, role]);
  if (demo.error) return <ErrorAlert error={demo.error} />;
  if (!ready) return <Loading />;
  return <>{children}</>;
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      display_name: string;
      account_type: "teacher" | "student";
      join_code?: string | null;
    }) => api.post<UserOut>("/auth/register", body),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}

export function homeFor(user: UserOut): string {
  return user.account_type === "teacher" ? "/teacher" : "/student";
}

export function RequireAuth({
  role,
  children,
}: {
  role?: "teacher" | "student";
  children: ReactNode;
}) {
  const me = useMe();
  const demo = useDemoMode();
  const location = useLocation();
  if (me.isPending || (!me.data && demo.pending)) return <Loading />;
  if (me.error) return <ErrorAlert error={me.error} />;
  // demo mode: no sign-in; enter as the account this page needs. The shared layout has no role of
  // its own, so the portal in the URL decides (the teacher for shared pages).
  if (demo.enabled && (!me.data || (role && me.data.account_type !== role))) {
    const fallback = location.pathname.startsWith("/student") ? "student" : "teacher";
    return <DemoEnter role={role ?? fallback}>{children}</DemoEnter>;
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && me.data.account_type !== role) return <Navigate to={homeFor(me.data)} replace />;
  return <>{children}</>;
}
