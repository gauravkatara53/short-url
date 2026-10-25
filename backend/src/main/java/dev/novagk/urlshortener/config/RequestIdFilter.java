package dev.novagk.urlshortener.config;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.UUID;

/**
 * Request ID propagation filter matching the Node.js requestId middleware.
 * Extracts X-Request-ID or X-Correlation-ID from incoming headers, or generates a new UUID.
 */
@Component
@Order(1)
public class RequestIdFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) request;
        HttpServletResponse httpRes = (HttpServletResponse) response;

        String incoming = httpReq.getHeader("X-Request-ID");
        if (incoming == null || incoming.isBlank()) {
            incoming = httpReq.getHeader("X-Correlation-ID");
        }

        String requestId;
        if (incoming != null && !incoming.isBlank()
                && incoming.length() <= 64
                && incoming.matches("^[A-Za-z0-9\\-_]+$")) {
            requestId = incoming.trim();
        } else {
            requestId = UUID.randomUUID().toString();
        }

        httpReq.setAttribute("requestId", requestId);
        httpRes.setHeader("X-Request-ID", requestId);

        chain.doFilter(request, response);
    }
}
