import { useQuery } from "@tanstack/react-query";
import { api, getToken } from "../services/api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, enabled: !!getToken(), staleTime: 60_000, retry: false });
}
