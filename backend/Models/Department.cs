namespace backend.Models;

// D1: one row of the canonical departments list (migration 011).
public class Department
{
    public int DepartmentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public int UserCount { get; set; }   // computed for the admin view
}
