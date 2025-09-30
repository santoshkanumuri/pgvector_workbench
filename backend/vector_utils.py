"""
Utility functions for vector operations and dimensionality reduction
"""
import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from sklearn.decomposition import PCA
from sklearn.manifold import TSNE
import asyncio
from concurrent.futures import ThreadPoolExecutor

# Thread pool for CPU-intensive operations
_executor = ThreadPoolExecutor(max_workers=4)


def reduce_dimensions_pca(
    vectors: List[List[float]], 
    n_components: int = 2
) -> List[List[float]]:
    """
    Reduce vector dimensions using PCA
    
    Args:
        vectors: List of high-dimensional vectors
        n_components: Target number of dimensions (2 or 3)
        
    Returns:
        List of reduced vectors
    """
    if not vectors:
        return []
    
    X = np.array(vectors)
    pca = PCA(n_components=n_components)
    reduced = pca.fit_transform(X)
    
    return reduced.tolist()


def reduce_dimensions_tsne(
    vectors: List[List[float]], 
    n_components: int = 2,
    perplexity: float = 30.0,
    random_state: int = 42
) -> List[List[float]]:
    """
    Reduce vector dimensions using t-SNE
    
    Args:
        vectors: List of high-dimensional vectors
        n_components: Target number of dimensions (2 or 3)
        perplexity: t-SNE perplexity parameter
        random_state: Random seed for reproducibility
        
    Returns:
        List of reduced vectors
    """
    if not vectors:
        return []
    
    X = np.array(vectors)
    
    # Adjust perplexity based on dataset size
    n_samples = X.shape[0]
    perplexity = min(perplexity, (n_samples - 1) / 3)
    
    tsne = TSNE(
        n_components=n_components,
        perplexity=perplexity,
        random_state=random_state,
        max_iter=1000,  # Changed from n_iter to max_iter for newer scikit-learn
        learning_rate='auto',
        init='pca'
    )
    reduced = tsne.fit_transform(X)
    
    return reduced.tolist()


def reduce_dimensions_umap(
    vectors: List[List[float]], 
    n_components: int = 2,
    n_neighbors: int = 15,
    min_dist: float = 0.1,
    random_state: int = 42
) -> List[List[float]]:
    """
    Reduce vector dimensions using UMAP
    
    Args:
        vectors: List of high-dimensional vectors
        n_components: Target number of dimensions (2 or 3)
        n_neighbors: Number of neighbors for UMAP
        min_dist: Minimum distance between points
        random_state: Random seed for reproducibility
        
    Returns:
        List of reduced vectors
    """
    try:
        import umap
    except ImportError:
        raise ImportError("UMAP not installed. Install with: pip install umap-learn")
    
    if not vectors:
        return []
    
    X = np.array(vectors)
    
    # Adjust n_neighbors based on dataset size
    n_samples = X.shape[0]
    n_neighbors = min(n_neighbors, n_samples - 1)
    
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        random_state=random_state,
        metric='cosine'
    )
    reduced = reducer.fit_transform(X)
    
    return reduced.tolist()


async def reduce_dimensions_async(
    vectors: List[List[float]],
    method: str = 'pca',
    n_components: int = 2,
    **kwargs
) -> List[List[float]]:
    """
    Async wrapper for dimensionality reduction to avoid blocking
    
    Args:
        vectors: List of high-dimensional vectors
        method: Reduction method ('pca', 'tsne', 'umap')
        n_components: Target dimensions
        **kwargs: Additional parameters for the reduction method
        
    Returns:
        List of reduced vectors
    """
    loop = asyncio.get_event_loop()
    
    if method == 'pca':
        return await loop.run_in_executor(
            _executor, 
            reduce_dimensions_pca, 
            vectors, 
            n_components
        )
    elif method == 'tsne':
        perplexity = kwargs.get('perplexity', 30.0)
        random_state = kwargs.get('random_state', 42)
        return await loop.run_in_executor(
            _executor,
            reduce_dimensions_tsne,
            vectors,
            n_components,
            perplexity,
            random_state
        )
    elif method == 'umap':
        n_neighbors = kwargs.get('n_neighbors', 15)
        min_dist = kwargs.get('min_dist', 0.1)
        random_state = kwargs.get('random_state', 42)
        return await loop.run_in_executor(
            _executor,
            reduce_dimensions_umap,
            vectors,
            n_components,
            n_neighbors,
            min_dist,
            random_state
        )
    else:
        raise ValueError(f"Unknown reduction method: {method}")


def calculate_vector_statistics(vectors: List[List[float]]) -> Dict[str, Any]:
    """
    Calculate statistics for a set of vectors
    
    Args:
        vectors: List of vectors
        
    Returns:
        Dictionary with statistics
    """
    if not vectors:
        return {}
    
    X = np.array(vectors)
    
    return {
        "count": len(vectors),
        "dimensions": X.shape[1],
        "mean_norm": float(np.linalg.norm(X, axis=1).mean()),
        "std_norm": float(np.linalg.norm(X, axis=1).std()),
        "min_norm": float(np.linalg.norm(X, axis=1).min()),
        "max_norm": float(np.linalg.norm(X, axis=1).max()),
        "mean_per_dim": X.mean(axis=0).tolist(),
        "std_per_dim": X.std(axis=0).tolist(),
    }


def find_outliers(
    vectors: List[List[float]], 
    threshold: float = 3.0
) -> List[int]:
    """
    Find outlier vectors using z-score method
    
    Args:
        vectors: List of vectors
        threshold: Z-score threshold for outliers
        
    Returns:
        List of indices of outlier vectors
    """
    if not vectors:
        return []
    
    X = np.array(vectors)
    norms = np.linalg.norm(X, axis=1)
    
    mean_norm = norms.mean()
    std_norm = norms.std()
    
    z_scores = np.abs((norms - mean_norm) / std_norm)
    outlier_indices = np.where(z_scores > threshold)[0]
    
    return outlier_indices.tolist()


def calculate_similarity_matrix(
    vectors: List[List[float]], 
    metric: str = 'cosine',
    sample_size: Optional[int] = None
) -> List[List[float]]:
    """
    Calculate pairwise similarity matrix for vectors
    
    Args:
        vectors: List of vectors
        metric: Similarity metric ('cosine', 'euclidean')
        sample_size: If provided, sample this many vectors
        
    Returns:
        Similarity matrix as list of lists
    """
    if not vectors:
        return []
    
    X = np.array(vectors)
    
    # Sample if dataset is large
    if sample_size and len(vectors) > sample_size:
        indices = np.random.choice(len(vectors), sample_size, replace=False)
        X = X[indices]
    
    if metric == 'cosine':
        # Normalize vectors
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        X_normalized = X / (norms + 1e-10)
        # Cosine similarity is dot product of normalized vectors
        similarity = np.dot(X_normalized, X_normalized.T)
    elif metric == 'euclidean':
        # Convert euclidean distance to similarity
        from sklearn.metrics.pairwise import euclidean_distances
        distances = euclidean_distances(X)
        # Convert to similarity (higher is more similar)
        similarity = 1 / (1 + distances)
    else:
        raise ValueError(f"Unknown metric: {metric}")
    
    return similarity.tolist()


def perform_clustering(
    vectors: List[List[float]],
    n_clusters: int = 5,
    method: str = 'kmeans'
) -> Tuple[List[int], List[List[float]]]:
    """
    Perform clustering on vectors
    
    Args:
        vectors: List of vectors
        n_clusters: Number of clusters
        method: Clustering method ('kmeans', 'dbscan')
        
    Returns:
        Tuple of (cluster labels, cluster centers)
    """
    if not vectors:
        return [], []
    
    X = np.array(vectors)
    
    if method == 'kmeans':
        from sklearn.cluster import KMeans
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = kmeans.fit_predict(X)
        centers = kmeans.cluster_centers_.tolist()
        return labels.tolist(), centers
    elif method == 'dbscan':
        from sklearn.cluster import DBSCAN
        dbscan = DBSCAN(eps=0.5, min_samples=5, metric='cosine')
        labels = dbscan.fit_predict(X)
        # Calculate centers for each cluster
        unique_labels = set(labels)
        centers = []
        for label in unique_labels:
            if label != -1:  # -1 is noise in DBSCAN
                cluster_points = X[labels == label]
                center = cluster_points.mean(axis=0)
                centers.append(center.tolist())
        return labels.tolist(), centers
    else:
        raise ValueError(f"Unknown clustering method: {method}")
