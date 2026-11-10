namespace backend.Models;

// D2: one Finance payout of a fully approved request (table disbursements, migration 012).
public class Disbursement
{
    public int DisbursementId { get; set; }
    public int RequestId { get; set; }
    public int DisbursedBy { get; set; }
    public decimal Amount { get; set; }          // copied from the request at payment time
    public string? Reference { get; set; }       // optional payment reference (e.g. bank/M-Pesa ref)
    public string? Note { get; set; }            // optional internal memo
    public DateTime DisbursedAt { get; set; }
    public string? DisbursedByName { get; set; } // joined for display
}
