import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadFavoriteIds, reportFavoriteError, setFavorite } from "../adapters/favoritesAdapter";

export function useFavorites() {
  const queryClient = useQueryClient();
  const favorites = useQuery({
    queryKey: ["storefront", "favorites"],
    queryFn: () => loadFavoriteIds(),
    staleTime: 15_000,
  });
  const mutation = useMutation({
    mutationFn: ({ productId, favorite }: { productId: number; favorite: boolean }) => setFavorite(productId, favorite),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["storefront", "favorites"] }),
    onError: reportFavoriteError,
  });
  return { favoriteIds: favorites.data ?? new Set<number>(), favorites, mutation };
}
