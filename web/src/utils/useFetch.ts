// ==========================================================
// useFetch: un "hook" propio para cargar datos de la API.
// Lo usan casi todas las pantallas, así no repetimos la misma
// lógica de "cargando / error / datos" en cada una.
//
// Uso:  const { data, error, loading, reload } = useFetch(() => api.getMyReservations(), "mis-reservas");
// Cuando cambia "key", vuelve a cargar (por ejemplo, al cambiar la fecha).
// ==========================================================
import { useCallback, useEffect, useState } from "react";

interface FetchState<T> {
  key: string;
  data?: T;
  error?: unknown;
}

export function useFetch<T>(load: () => Promise<T>, key: string) {
  const [state, setState] = useState<FetchState<T>>({ key: "" });
  const [reloadCount, setReloadCount] = useState(0);
  const fullKey = `${key}#${reloadCount}`;

  useEffect(() => {
    // "ignore" evita guardar una respuesta vieja: si el usuario cambia de fecha
    // rápido, la respuesta de la fecha anterior podría llegar DESPUÉS.
    let ignore = false;
    load().then(
      (data) => {
        if (!ignore) setState({ key: fullKey, data });
      },
      (error: unknown) => {
        if (!ignore) setState((previous) => ({ key: fullKey, data: previous.data, error }));
      }
    );
    return () => {
      ignore = true;
    };
    // Solo recargamos cuando cambia la clave (load es una función nueva en cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return {
    data: state.data, // se mantienen los datos anteriores mientras carga (sin parpadeo)
    error: state.key === fullKey ? state.error : undefined,
    loading: state.key !== fullKey,
    reload,
  };
}
