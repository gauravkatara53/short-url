package dev.novagk.urlshortener.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * Custom application exception with HTTP status code.
 * Equivalent to the Node.js AppError class.
 */
@Getter
public class AppException extends RuntimeException {

    private final HttpStatus status;

    public AppException(String message, HttpStatus status) {
        super(message);
        this.status = status;
    }

    public int getStatusCode() {
        return status.value();
    }
}
