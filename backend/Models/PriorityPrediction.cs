namespace backend.Models;

public class PriorityPrediction
{
    public int PredictionId { get; set; }
    public int RequestId { get; set; }
    public string PriorityLevel { get; set; } = string.Empty;
    public string? Explanation { get; set; }
    public DateTime PredictedAt  { get; set; }
}