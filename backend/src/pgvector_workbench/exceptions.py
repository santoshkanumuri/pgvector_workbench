"""
Exception classes for the pgvector_workbench package.

This module defines custom exception classes for consistent error handling
across all backend modules.
"""

class PgVectorWorkbenchError(Exception):
    """Base exception class for all pgvector_workbench errors."""
    
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ConnectionError(PgVectorWorkbenchError):
    """Exception raised for database connection errors."""
    
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(f"Connection error: {message}", status_code)


class QueryError(PgVectorWorkbenchError):
    """Exception raised for database query errors."""
    
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(f"Query error: {message}", status_code)


class VectorOperationError(PgVectorWorkbenchError):
    """Exception raised for vector operation errors."""
    
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(f"Vector operation error: {message}", status_code)


class ConfigurationError(PgVectorWorkbenchError):
    """Exception raised for configuration errors."""
    
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(f"Configuration error: {message}", status_code)


class AuthenticationError(PgVectorWorkbenchError):
    """Exception raised for authentication errors."""
    
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(f"Authentication error: {message}", status_code)


class NotFoundError(PgVectorWorkbenchError):
    """Exception raised when a requested resource is not found."""
    
    def __init__(self, message: str, status_code: int = 404):
        super().__init__(f"Not found: {message}", status_code)


class ValidationError(PgVectorWorkbenchError):
    """Exception raised for validation errors."""
    
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(f"Validation error: {message}", status_code)


class TimeoutError(PgVectorWorkbenchError):
    """Exception raised for timeout errors."""
    
    def __init__(self, message: str, status_code: int = 408):
        super().__init__(f"Timeout error: {message}", status_code)