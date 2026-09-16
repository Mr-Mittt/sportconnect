package com.sportconnect.location.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.locationtech.jts.geom.Point;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "locations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Location {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 500)
    private String address;

    @Column(columnDefinition = "geography(Point, 4326)")
    private Point location;

    @Column(name = "source_maps_url", length = 1000)
    private String sourceMapsUrl;

    /** LOC-4 — IANA zone id (e.g. {@code Asia/Ho_Chi_Minh}), derived automatically from {@code
     * location}'s coordinates at creation time. Nullable and best-effort: null when the location
     * has no coordinates, and also null (never rejected, never defaulted) when coordinates exist
     * but fall outside every timezone polygon (open ocean, parts of Antarctica). No update path
     * exists yet — see {@code location-impl/CLAUDE.md}. */
    @Column(length = 64)
    private String timezone;

    @Column(name = "claimed_by_vendor_id")
    private Long claimedByVendorId;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Location)) return false;
        Location that = (Location) o;
        return id != null && id.equals(that.getId());
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
