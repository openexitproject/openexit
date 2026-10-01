module OpenExit
  class Error < StandardError; end
  class PaspError < Error
    attr_reader :code, :context
    def initialize(code, message, context: nil)
      @code = code
      @context = context
      super(message)
    end
  end
end
