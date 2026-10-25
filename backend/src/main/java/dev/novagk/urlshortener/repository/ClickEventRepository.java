package dev.novagk.urlshortener.repository;

import dev.novagk.urlshortener.entity.ClickEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface ClickEventRepository extends JpaRepository<ClickEventEntity, UUID> {

    long countByShortCode(String shortCode);
}
