using System.Text.Json;

namespace backend.M1;

public interface IModelService
{
    Task<PredictResponse?> PredictAsync(PredictRequest request);
}

public class ModelService : IModelService
{
    private readonly HttpClient _http;
    private readonly ILogger<ModelService> _logger;

    public ModelService(HttpClient http, ILogger<ModelService> logger)
    {
        _http = http;
        _logger = logger;
    }
    
    public async Task<PredictResponse?> PredictAsync(PredictRequest request)
    {
        const int maxAttempts = 2;

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                var response = await _http.PostAsJsonAsync("/predict", request);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning(
                        "Model service returned {Status} on attempt {Attempt}.",
                        (int)response.StatusCode, attempt);
                    continue; //try again or fall through to null after loop
                }
                var json = await response.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<PredictResponse>(json);
            }
            catch (TaskCanceledException)
            {
                //Timeout
                _logger.LogWarning("Model service timed out on attempt {Attempt}.", attempt);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Model service unreachable on attempt {Attempt}.", attempt);
            }
        }
        //All attempts failed, degrade gracefully. The caller stores the request unclassified
        _logger.LogWarning("Model service unavailable after {Attempts} attempts; request will be unclassified.", maxAttempts);
        return null;
    }
}