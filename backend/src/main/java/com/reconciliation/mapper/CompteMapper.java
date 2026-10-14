package com.reconciliation.mapper;

import com.reconciliation.dto.CompteDTO;
import com.reconciliation.entity.CompteEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

@Mapper(
    componentModel = "spring",
    nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
    unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface CompteMapper {

    @Mapping(target = "id", ignore = true)
    CompteEntity toEntity(CompteDTO dto);

    CompteDTO toDTO(CompteEntity entity);

    @Mapping(target = "id", ignore = true)
    void updateEntityFromDTO(CompteDTO dto, @MappingTarget CompteEntity entity);
}