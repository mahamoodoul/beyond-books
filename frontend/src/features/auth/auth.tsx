import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
    mutationFn: (body: { email: string; password: string }) => api.post<UserOut>("/auth/login", body),
    onSuccess: (user) => { qc.clear(); qc.setQueryData(ME_KEY, user); },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (body: {
      email: string;
      password: string;
      display_name: string;
      account_type: "teacher" | "student";
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
  const location = useLocation();
  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorAlert error={me.error} />;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && me.data.account_type !== role) return <Navigate to={homeFor(me.data)} replace />;
  return <>{children}</>;
}
