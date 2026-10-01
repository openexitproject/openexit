namespace OpenExit;

/// <summary>Reports a PASP package or manifest error using its canonical code.</summary>
public sealed class PaspException : Exception
{
    /// <summary>Canonical PASP error code.</summary>
    public string Code { get; }
    /// <summary>Safe contextual values associated with the error.</summary>
    public IReadOnlyDictionary<string, object?>? Context { get; }

    public PaspException(string code, string message, IReadOnlyDictionary<string, object?>? context = null, Exception? innerException = null)
        : base(message, innerException) { Code = code; Context = context; }
}
