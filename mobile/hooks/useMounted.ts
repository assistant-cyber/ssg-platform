import { useEffect, useRef } from 'react';

/**
 * Hook to track if a component is still mounted.
 * Use this to guard async callbacks that might complete after unmount.
 *
 * Example:
 *   const isMounted = useMounted();
 *   async function load() {
 *     const data = await api.fetch();
 *     if (!isMounted.current) return; // Don't setState or Alert after unmount
 *     setState(data);
 *   }
 */
export function useMounted() {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return mountedRef;
}
