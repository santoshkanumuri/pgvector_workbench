"""
Utility functions for exporting data in various formats
"""
import csv
import json
from io import StringIO
from typing import List, Dict, Any
from datetime import datetime, date
import asyncio


def serialize_value(value: Any) -> Any:
    """
    Serialize value for JSON export, handling special types
    """
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    elif isinstance(value, bytes):
        return value.hex()
    elif isinstance(value, list):
        return [serialize_value(v) for v in value]
    elif isinstance(value, dict):
        return {k: serialize_value(v) for k, v in value.items()}
    else:
        return value


async def export_to_json(
    data: List[Dict[str, Any]],
    pretty: bool = True
) -> str:
    """
    Export data to JSON format
    
    Args:
        data: List of dictionaries to export
        pretty: Whether to pretty-print JSON
        
    Returns:
        JSON string
    """
    # Serialize all values
    serialized_data = [
        {k: serialize_value(v) for k, v in row.items()}
        for row in data
    ]
    
    if pretty:
        return json.dumps(serialized_data, indent=2)
    return json.dumps(serialized_data)


async def export_to_csv(
    data: List[Dict[str, Any]],
    include_headers: bool = True
) -> str:
    """
    Export data to CSV format
    
    Args:
        data: List of dictionaries to export
        include_headers: Whether to include column headers
        
    Returns:
        CSV string
    """
    if not data:
        return ""
    
    output = StringIO()
    
    # Get all unique keys across all rows
    fieldnames = set()
    for row in data:
        fieldnames.update(row.keys())
    fieldnames = sorted(list(fieldnames))
    
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    
    if include_headers:
        writer.writeheader()
    
    # Write rows with serialized values
    for row in data:
        serialized_row = {}
        for key, value in row.items():
            # Convert lists/dicts to JSON strings for CSV
            if isinstance(value, (list, dict)):
                serialized_row[key] = json.dumps(value)
            elif isinstance(value, (datetime, date)):
                serialized_row[key] = value.isoformat()
            elif value is None:
                serialized_row[key] = ''
            else:
                serialized_row[key] = str(value)
        writer.writerow(serialized_row)
    
    return output.getvalue()


async def export_to_jsonl(
    data: List[Dict[str, Any]]
) -> str:
    """
    Export data to JSON Lines format (one JSON object per line)
    
    Args:
        data: List of dictionaries to export
        
    Returns:
        JSONL string
    """
    lines = []
    for row in data:
        serialized_row = {k: serialize_value(v) for k, v in row.items()}
        lines.append(json.dumps(serialized_row))
    
    return '\n'.join(lines)


async def export_to_markdown_table(
    data: List[Dict[str, Any]],
    max_cell_length: int = 50
) -> str:
    """
    Export data to Markdown table format
    
    Args:
        data: List of dictionaries to export
        max_cell_length: Maximum length for cell content
        
    Returns:
        Markdown table string
    """
    if not data:
        return ""
    
    # Get all columns
    columns = list(data[0].keys())
    
    # Build header
    header = "| " + " | ".join(columns) + " |"
    separator = "| " + " | ".join(["---"] * len(columns)) + " |"
    
    # Build rows
    rows = []
    for row in data:
        cells = []
        for col in columns:
            value = row.get(col, '')
            # Serialize complex types
            if isinstance(value, (list, dict)):
                value = json.dumps(value)
            elif isinstance(value, (datetime, date)):
                value = value.isoformat()
            elif value is None:
                value = 'null'
            else:
                value = str(value)
            
            # Truncate long values
            if len(value) > max_cell_length:
                value = value[:max_cell_length - 3] + '...'
            
            # Escape pipe characters
            value = value.replace('|', '\\|')
            cells.append(value)
        
        rows.append("| " + " | ".join(cells) + " |")
    
    return "\n".join([header, separator] + rows)


def get_export_filename(
    table_name: str,
    format: str,
    timestamp: bool = True
) -> str:
    """
    Generate a filename for exported data
    
    Args:
        table_name: Name of the table being exported
        format: Export format (csv, json, jsonl, md)
        timestamp: Whether to include timestamp in filename
        
    Returns:
        Suggested filename
    """
    base_name = table_name.replace('.', '_')
    
    if timestamp:
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        return f"{base_name}_{ts}.{format}"
    
    return f"{base_name}.{format}"
