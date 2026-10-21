using System.Text.Json.Serialization;

namespace backend.M1;

//Matched the FastAPI RequestFeatures schema 
public class PredictRequest
{
    [JsonPropertyName("request_category")]
    public string RequestCategory { get; set; } = string.Empty;

    [JsonPropertyName("requested_amount")]
    public decimal RequestedAmount { get; set; }

    [JsonPropertyName("salary")]
    public decimal Salary { get; set; }

    [JsonPropertyName("employment_duration_months")]
    public int EmploymentDurationMonths { get; set; }

    [JsonPropertyName("previous_requests")]
    public int PreviousRequests { get; set; }

    [JsonPropertyName("request_frequency")]
    public int RequestFrequency { get; set; }

    [JsonPropertyName("has_documents")]
    public int HasDocuments { get; set; }
}

//Matches the FastAPI /predict response.
public class PredictResponse
{
    [JsonPropertyName("priority")]
    public string Priority { get; set; } = string.Empty;

    [JsonPropertyName("explanation")]
    public List<ShapFactor> Explanation { get; set; } = new();
}

public class ShapFactor
{
    [JsonPropertyName("feature")]
    public string Feature { get; set; } = string.Empty;

    [JsonPropertyName("impact")]
    public double Impact { get; set; }
}